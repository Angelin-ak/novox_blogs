import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { Octokit } from '@octokit/rest';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Authentication Middleware (Disabled)
const authenticate = (req, res, next) => {
  next();
};

// Route: Verify Passcode
app.post('/api/verify-passcode', (req, res) => {
  const { passcode } = req.body;
  if (passcode === process.env.ADMIN_PASSCODE) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid passcode' });
  }
});

// Robust JSON parser with regex fallback to handle unescaped control characters/quotes from LLM
function robustJSONParse(text) {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '').trim();
  }

  try {
    return JSON.parse(cleaned);
  } catch (parseError) {
    console.warn("Standard JSON.parse failed, attempting robust regex-based extraction...", parseError.message);
    
    const titleMatch = cleaned.match(/"title"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    const descMatch = cleaned.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    
    // For content_html, since it is the last field, we greedily capture everything
    // between its opening double quote and the final closing brace.
    let contentMatch = cleaned.match(/"content_html"\s*:\s*"(.*)"\s*\}\s*$/s);
    
    if (!contentMatch) {
      contentMatch = cleaned.match(/"content_html"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    }

    if (titleMatch && descMatch && contentMatch) {
      const unescapeJSONString = (str) => {
        try {
          return JSON.parse(`"${str.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}"`);
        } catch (e) {
          return str
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\r/g, '\r')
            .replace(/\\t/g, '\t')
            .replace(/\\\\/g, '\\');
        }
      };

      return {
        title: unescapeJSONString(titleMatch[1]),
        description: unescapeJSONString(descMatch[1]),
        content_html: unescapeJSONString(contentMatch[1])
      };
    }
    
    throw parseError;
  }
}

// Route: Generate Blog Content using Gemini
app.post('/api/generate', authenticate, async (req, res) => {
  const { topic, keywords, category, author, primary_keyword, landing_url, generate_image } = req.body;

  if (!topic || !keywords || !category || !author || !primary_keyword || !landing_url) {
    return res.status(400).json({ error: 'Missing required parameters (topic, keywords, category, author, primary_keyword, landing_url)' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API Key is not configured on the server.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `You are a professional EdTech copywriter for Novox Edtech (an IT and software training institute in Calicut, Kerala).
Generate a highly engaging, SEO-optimized blog article based on the following inputs:
- Topic: "${topic}"
- Primary Target Keyword: "${primary_keyword}"
- All Keywords: ${JSON.stringify(keywords)}
- Category: "${category}"
- Author: "${author}"

Your response must be returned as a valid JSON object containing exactly three keys:
1. "title": A compelling, search-intent driven title (H1) containing the main keyword. Max 60 characters.
2. "description": An engaging meta description (120-155 characters).
3. "content_html": The HTML body content of the article.

In "content_html", ensure the following content hierarchy is strictly enforced:
- Do NOT include any H1 tag inside content_html (the main title acts as the H1).
- Begin directly with an introduction summary paragraph that naturally weaves the primary target keyword into the first 2-3 sentences.
- Focus heavily on human-centric student benefits, job placement, and career growth in Kerala/India, rather than just technical dry course listings.
- Structure the sub-sections using semantic HTML <h2> and <h3> tags.
- Provide a distinct "Frequently Asked Questions" section before closure. Under this section, wrap each question in <h3> and answer in <p>.
- Terminate with a strong conclusion summary paragraph under an explicit "<h2>Conclusion</h2>" (or "<h2>Summary</h2>") heading.
- Add 1-2 natural inline internal hyperlinks inside the body paragraphs linking relevant course/skills phrases to the course URL using the exact placeholder string "{{COURSE_URL}}" as the href (e.g. <a href="{{COURSE_URL}}">MERN Stack Course</a>).
- Add an explicit standalone Call-to-Action (CTA) link mapping to the contact page ("contact.html") at the very end. The CTA must be styled exactly as a button using this structure:
<div class="tp-contact-btn text-center mt-30">
  <a class="tp-btn-inner" href="contact.html">[CTA Button Text, e.g., Contact Us Now]</a>
</div>
Do NOT output a simple inline text anchor for the main CTA. It must use the wrapper div with the class "tp-contact-btn" and the anchor with the class "tp-btn-inner".
- Ensure the primary target keyword appears at least 4 times in the text (naturally spread across paragraphs).

Ensure the response matches application/json mime-type and contains valid, parsing JSON.`;

    const contentModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];
    let response;
    let lastErr;
    let selectedModel = '';

    for (const model of contentModels) {
      try {
        console.log(`Attempting content generation with model: ${model}...`);
        response = await ai.models.generateContent({
          model: model,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                description: { type: 'STRING' },
                content_html: { type: 'STRING' }
              },
              required: ['title', 'description', 'content_html']
            }
          }
        });
        selectedModel = model;
        console.log(`Successfully generated content using model: ${model}`);
        break; // Success! Exit loop
      } catch (err) {
        console.warn(`Model ${model} failed:`, err.message);
        lastErr = err;
      }
    }

    if (!response) {
      throw lastErr || new Error('All generation models failed.');
    }

    const resultText = response.text;
    const parsedResult = robustJSONParse(resultText);

    let imageBase64 = null;
    if (generate_image) {
      const imagePrompt = `A premium tech-concept digital illustration or 3D render representing '${parsedResult.title}'. Modern corporate style, vibrant blue and purple highlights, dark background, professional graphic design.`;
      const imageModels = ['imagen-4.0-fast-generate-001', 'imagen-4.0-generate-001', 'imagen-4.0-ultra-generate-001'];
      let imgErr;
      
      for (const imgModel of imageModels) {
        try {
          console.log(`Attempting image generation with model: ${imgModel}...`);
          const imageResponse = await ai.models.generateImages({
            model: imgModel,
            prompt: imagePrompt,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/png',
              aspectRatio: '16:9'
            }
          });
          if (imageResponse.generatedImages && imageResponse.generatedImages.length > 0) {
            imageBase64 = imageResponse.generatedImages[0].image.imageBytes;
            console.log(`Successfully generated image using model: ${imgModel}`);
            break;
          }
        } catch (err) {
          console.warn(`Image model ${imgModel} failed:`, err.message);
          imgErr = err;
        }
      }
      
      if (!imageBase64 && imgErr) {
        console.warn('All image generation models failed:', imgErr.message);
      }
    }

    res.json({
      ...parsedResult,
      image_base64: imageBase64,
      usage_metadata: response.usageMetadata || null
    });
  } catch (error) {
    console.error('Error generating content:', error);
    res.status(500).json({ error: 'Failed to generate content: ' + error.message });
  }
});

// Route: Generate Featured Image ONLY using Imagen
app.post('/api/generate-image-only', authenticate, async (req, res) => {
  const { title } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Missing required parameter (title)' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API Key is not configured on the server.' });
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const imagePrompt = `A premium tech-concept digital illustration or 3D render representing '${title}'. Modern corporate style, vibrant blue and purple highlights, dark background, professional graphic design.`;
    
    console.log(`Generating image only for: "${title}"...`);
    const imageModels = ['imagen-4.0-fast-generate-001', 'imagen-4.0-generate-001', 'imagen-4.0-ultra-generate-001'];
    let imageBase64 = null;
    let imgErr;

    for (const imgModel of imageModels) {
      try {
        console.log(`Attempting image generation with model: ${imgModel}...`);
        const imageResponse = await ai.models.generateImages({
          model: imgModel,
          prompt: imagePrompt,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: '16:9'
          }
        });
        if (imageResponse.generatedImages && imageResponse.generatedImages.length > 0) {
          imageBase64 = imageResponse.generatedImages[0].image.imageBytes;
          console.log(`Successfully generated image using model: ${imgModel}`);
          break;
        }
      } catch (err) {
        console.warn(`Image model ${imgModel} failed:`, err.message);
        imgErr = err;
      }
    }

    if (!imageBase64) {
      throw imgErr || new Error('All image generation models failed.');
    }

    res.json({
      image_base64: imageBase64
    });
  } catch (error) {
    console.error('Error generating image only:', error);
    res.status(500).json({ error: 'Failed to generate image: ' + error.message });
  }
});

// Helper to parse dates for chronological sorting
function parseBlogDate(dateStr) {
  if (!dateStr) return new Date(0);
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return new Date(0);
  return d;
}

// Helper to parse card structures from blogs.html grid content
function parseBlogCards(gridContent) {
  const cards = [];
  let pos = 0;
  
  while (true) {
    const nextCardStart = gridContent.indexOf('grid-item', pos);
    if (nextCardStart === -1) break;
    
    const startDiv = gridContent.lastIndexOf('<div', nextCardStart);
    if (startDiv === -1) break;
    
    let cardStartPos = startDiv;
    const commentIndex = gridContent.lastIndexOf('<!--', startDiv);
    if (commentIndex !== -1 && commentIndex > startDiv - 150) {
      const commentText = gridContent.substring(commentIndex, startDiv);
      if (commentText.includes('Post:')) {
        cardStartPos = commentIndex;
      }
    }
    
    let depth = 1;
    let scanPos = startDiv + 4;
    let cardEndPos = -1;
    
    while (scanPos < gridContent.length) {
      const nextOpen = gridContent.indexOf('<div', scanPos);
      const nextClose = gridContent.indexOf('</div', scanPos);
      
      if (nextOpen === -1 && nextClose === -1) break;
      
      if (nextOpen !== -1 && (nextClose === -1 || nextOpen < nextClose)) {
        depth++;
        scanPos = nextOpen + 4;
      } else {
        depth--;
        scanPos = nextClose + 6; // Include full </div>
        if (depth === 0) {
          cardEndPos = scanPos;
          break;
        }
      }
    }
    
    if (cardEndPos !== -1) {
      const cardHtml = gridContent.substring(cardStartPos, cardEndPos);
      
      const hrefMatch = cardHtml.match(/href=["']([^"']+\.html)["']/i);
      const filename = hrefMatch ? hrefMatch[1] : '';
      
      const titleMatch = cardHtml.match(/<h3[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i) ||
                         cardHtml.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
      const title = titleMatch ? titleMatch[1].replace(/<[^>]*>/g, '').trim() : '';
      
      const dateMatch = cardHtml.match(/<span\s+class=["']modern-date["'][^>]*>([\s\S]*?)<\/span>/gi);
      let dateText = '';
      if (dateMatch) {
        let selectedSpan = dateMatch[dateMatch.length - 1];
        for (const span of dateMatch) {
          if (span.includes('calendar-days') || !span.includes('author-span')) {
            selectedSpan = span;
          }
        }
        dateText = selectedSpan.replace(/<[^>]*>/g, '').trim();
      }
      
      cards.push({
        html: cardHtml.trim(),
        filename,
        title,
        dateStr: dateText,
        dateVal: parseBlogDate(dateText)
      });
      
      pos = cardEndPos;
    } else {
      pos = nextCardStart + 9;
    }
  }
  
  return cards;
}

// Helper for Category styles
function getCategoryStyle(catName) {
  const styleMap = {
    'Tech & Programming': ['cat-tech', 'background:#fee2e2; color:#b91c1c;'],
    'Career & Placement': ['cat-career', 'background:#fce7f3; color:#be185d;'],
    'Digital Marketing': ['cat-marketing', 'background:#d1fae5; color:#065f46;'],
    'Web Development': ['cat-web', 'background:#dcfce7; color:#166534;'],
    'App Development': ['cat-app', 'background:#e0f2fe; color:#0369a1;'],
    'Design': ['cat-design', 'background:#fef3c7; color:#d97706;'],
    'Artificial Intelligence': ['cat-ai', 'background:#e0e7ff; color:#4338ca;'],
    'Student & Learning': ['cat-student', 'background:#f3e8ff; color:#6b21a8;']
  };
  return styleMap[catName.trim()] || ['cat-tech', 'background:#fee2e2; color:#b91c1c;'];
}

// Route: Verify & Publish (Using GitHub API for cloud deployments)
app.post('/api/publish', authenticate, async (req, res) => {
  const { title, description, category, author, date, image, content_html, slug, landing_url, keyword, image_base64, original_filename } = req.body;

  if (!title || !description || !category || !author || !date || !image || !content_html || !slug || !landing_url || !keyword) {
    return res.status(400).json({ error: 'Missing required publication parameters' });
  }

  // 1. Run structural and SEO validations (Format Verification filter)
  const isEdit = !!original_filename;
  let finalContentHtml = content_html;

  try {
    const plainText = content_html.replace(/<[^>]*>/g, ' ');

    // intro keyword check
    const sentences = plainText.split('.').map(s => s.trim()).filter(s => s.length > 0);
    const introText = sentences.slice(0, 3).join(' ').toLowerCase();
    if (!isEdit && !introText.includes(keyword.toLowerCase())) {
      return res.status(400).json({ error: `Validation Error: The target SEO keyword '${keyword}' must naturally exist in the introduction summary paragraph (first 3 sentences)!` });
    }

    // keyword density check
    const regex = new RegExp(keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
    const kwMatches = plainText.match(regex) || [];
    if (!isEdit && kwMatches.length < 3) {
      return res.status(400).json({ error: `Validation Error: The targeted primary keyword '${keyword}' must appear at least 3 times in the text. Found ${kwMatches.length} times.` });
    }

    // no H1 check
    if (!isEdit && /<h1[^>]*>/i.test(content_html)) {
      return res.status(400).json({ error: "Validation Error: Semantic hierarchy mismatch. Do NOT include <h1> tags inside the content body." });
    }

    // H2 check
    const h2Matches = content_html.match(/<h2[^>]*>/gi) || [];
    if (!isEdit && h2Matches.length < 2) {
      return res.status(400).json({ error: `Validation Error: Semantic hierarchy mismatch. Must include at least two H2 subheadings. Found ${h2Matches.length}.` });
    }

    // FAQ check
    const faqPatterns = [/faq/i, /frequently asked questions/i, /doubt/i, /common question/i];
    const hasFaq = faqPatterns.some(pat => pat.test(plainText)) && /<h3[^>]*>/i.test(content_html);
    if (!isEdit && !hasFaq) {
      return res.status(400).json({ error: "Validation Error: Core structural mismatch. FAQ section is explicitly required before the end." });
    }

    // Conclusion check
    const conclusionPatterns = [/conclusion/i, /summary/i, /wrapping up/i, /final thoughts/i];
    const hasConclusion = conclusionPatterns.some(pat => pat.test(plainText));
    if (!isEdit && !hasConclusion) {
      return res.status(400).json({ error: "Validation Error: Core structural mismatch. A strong conclusion section is required." });
    }

    // Internal link check
    const linkRegex = /<a\s+[^>]*href=["']([^"']+)["']/gi;
    let linkMatches;
    let hasInternalLink = false;
    while ((linkMatches = linkRegex.exec(content_html)) !== null) {
      const href = linkMatches[1];
      if (href.includes('{{COURSE_URL}}') || href.includes(landing_url)) {
        hasInternalLink = true;
        break;
      }
    }
    if (!isEdit && !hasInternalLink) {
      return res.status(400).json({ error: "Validation Error: Core structural mismatch. Relevant text within the blog body must seamlessly hyperlink back to matching NovoX course pages." });
    }

    // CTA check matching the company's styled button
    const ctaPatterns = [/enroll/i, /contact/i, /register/i, /join/i, /start/i, /apply/i, /now/i, /us/i, /course/i, /program/i, /career/i];
    const ctaContainerRegex = /<div\s+[^>]*class=["'][^"']*tp-contact-btn[^"']*["'][^>]*>([\s\S]*?)<\/div>/gis;
    let ctaContainerMatch;
    let hasCta = false;
    while ((ctaContainerMatch = ctaContainerRegex.exec(content_html)) !== null) {
      const innerHtml = ctaContainerMatch[1];
      const aRegex = /<a\s+[^>]*class=["'][^"']*tp-btn-inner[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gis;
      let aMatch;
      while ((aMatch = aRegex.exec(innerHtml)) !== null) {
        const href = aMatch[1];
        const text = aMatch[2].replace(/<[^>]*>/g, '').trim();
        if (href.includes('contact.html') || href === 'contact.html') {
          if (ctaPatterns.some(pat => pat.test(text))) {
            hasCta = true;
            break;
          }
        }
      }
      if (hasCta) break;
    }

    if (!hasCta) {
      // Auto-inject default CTA button at the end of content_html
      finalContentHtml = content_html + `\n<div class="tp-contact-btn text-center mt-30">\n  <a class="tp-btn-inner" href="contact.html">Contact Us Now</a>\n</div>`;
    }

  } catch (err) {
    if (!isEdit) {
      return res.status(400).json({ error: 'Validation Error: ' + err.message });
    }
  }

  // 2. Fetch and commit to GitHub via REST API (Zero Local directory dependencies)
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!token || !owner || !repo) {
    return res.status(500).json({ error: 'GitHub Integration (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO) is not configured in the server environment.' });
  }

  try {
    const octokit = new Octokit({ auth: token });

    // Fetch Template
    const templateRes = await octokit.repos.getContent({ owner, repo, path: 'blog-template-v2.html', ref: branch });
    const templateHtml = Buffer.from(templateRes.data.content, 'base64').toString('utf8');

    // Determine actual image extension dynamically based on Base64 signature
    let imageExt = 'png';
    if (image_base64 && image_base64.startsWith('/9j/')) {
      imageExt = 'jpg';
    }
    const finalImageName = image_base64 ? `assets/img/blog/new/${slug}.${imageExt}` : image;

    // Compile new HTML
    const finalBodyHtml = finalContentHtml.replaceAll('{{COURSE_URL}}', landing_url);
    let compiledPage = templateHtml
      .replaceAll('{{TITLE}}', title)
      .replaceAll('{{DESCRIPTION}}', description)
      .replaceAll('{{CATEGORY}}', category)
      .replaceAll('{{IMAGE}}', finalImageName)
      .replaceAll('{{CONTENT}}', finalBodyHtml);

    // Dynamically replace hardcoded date and author in the template's meta section
    compiledPage = compiledPage.replace(
      /(<i\s+class=["']fa-light fa-calendar-days["']><\/i>)\s*[^<]+/gi,
      `$1 ${date}`
    );
    compiledPage = compiledPage.replace(
      /(<i\s+class=["']fa-light fa-user["']><\/i>)\s*(?:By\s+)?[^<]+/gi,
      `$1 By ${author}`
    );

    const newFilename = `${slug}.html`;

    // Fetch blogs.html
    const blogsRes = await octokit.repos.getContent({ owner, repo, path: 'blogs.html', ref: branch });
    const blogsHtml = Buffer.from(blogsRes.data.content, 'base64').toString('utf8');

    // 1. Find grid container start and end in blogs.html
    const gridMarker = '<div class="row grid">';
    const gridIndex = blogsHtml.indexOf(gridMarker);
    if (gridIndex === -1) {
      throw new Error('Could not find blog grid container (<div class="row grid">) inside blogs.html');
    }
    
    // Find the end of the grid row by tracking matching div depth
    let depth = 1;
    let scanPos = gridIndex + gridMarker.length;
    let gridEndPos = -1;
    
    while (scanPos < blogsHtml.length) {
      const nextOpen = blogsHtml.indexOf('<div', scanPos);
      const nextClose = blogsHtml.indexOf('</div', scanPos);
      
      if (nextOpen === -1 && nextClose === -1) break;
      
      if (nextOpen !== -1 && (nextClose === -1 || nextOpen < nextClose)) {
        depth++;
        scanPos = nextOpen + 4;
      } else {
        depth--;
        scanPos = nextClose + 6; // Include full </div>
        if (depth === 0) {
          gridEndPos = scanPos;
          break;
        }
      }
    }
    
    if (gridEndPos === -1) {
      throw new Error('Could not find matching end of the grid div in blogs.html');
    }

    const gridContent = blogsHtml.substring(gridIndex + gridMarker.length, gridEndPos - 6);
    let cards = parseBlogCards(gridContent);

    // 2. Compile the new card
    const [categoryClass, badgeStyle] = getCategoryStyle(category);
    const cardHtml = `               <!-- Post: ${title} -->
               <div class="col-xl-4 col-lg-6 col-md-6 mb-40 grid-item ${categoryClass}">
                  <div class="tp-blog-item modern-card">
                     <div class="tp-blog-thumb fix">
                        <a href="${newFilename}"><img alt="${title}" loading="lazy" src="${finalImageName}" /></a>
                     </div>
                     <div class="tp-blog-content modern-content">
                        <div class="tp-blog-tag mb-12">
                           <span class="modern-badge" style="${badgeStyle}">${category}</span>
                        </div>
                        <div class="tp-blog-meta-row d-flex align-items-center mb-15">
                           <span class="modern-date author-span">${author}</span>
                           <span class="modern-date">${date}</span>
                        </div>
                        <h3 class="tp-blog-title mb-20 modern-title"><a href="${newFilename}">${title}</a></h3>
                        <div class="spacer"></div>
                        <div class="tp-blog-btn flex-wrap d-flex align-items-center justify-content-between modern-footer">
                           <a class="read-more-link" href="${newFilename}">Read More</a>
                        </div>
                     </div>
                  </div>
               </div>`;

    // 3. Filter out any existing card for the same filename or original filename to prevent duplicates
    cards = cards.filter(c => c.filename !== newFilename && c.filename !== original_filename);

    // 4. Add the new card
    cards.push({
      html: cardHtml,
      filename: newFilename,
      title: title,
      dateStr: date,
      dateVal: parseBlogDate(date)
    });

    // 5. Sort cards chronologically (newest first)
    cards.sort((a, b) => b.dateVal.getTime() - a.dateVal.getTime());

    // 6. Rebuild and inject the sorted grid content
    const updatedGridContent = '\n' + cards.map(c => c.html).join('\n') + '\n';
    const updatedBlogsHtml = blogsHtml.substring(0, gridIndex + gridMarker.length) + updatedGridContent + blogsHtml.substring(gridEndPos - 6);

    // Fetch sitemap.xml
    const sitemapRes = await octokit.repos.getContent({ owner, repo, path: 'sitemap.xml', ref: branch });
    const sitemapXml = Buffer.from(sitemapRes.data.content, 'base64').toString('utf8');

    // Clean old sitemap entry if it exists to avoid duplication during edits
    let cleanedSitemapXml = sitemapXml;
    
    const escapedLocNew = `https://novoxedtechllp.com/${newFilename}`.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const urlPatternNew = new RegExp(
      `<url>\\s*<loc>${escapedLocNew}<\\/loc>\\s*<lastmod>.*?<\\/lastmod>\\s*<priority>.*?<\\/priority>\\s*<\\/url>\\s*`,
      'i'
    );
    cleanedSitemapXml = cleanedSitemapXml.replace(urlPatternNew, '');

    if (original_filename && original_filename !== newFilename) {
      const escapedLocOld = `https://novoxedtechllp.com/${original_filename}`.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const urlPatternOld = new RegExp(
        `<url>\\s*<loc>${escapedLocOld}<\\/loc>\\s*<lastmod>.*?<\\/lastmod>\\s*<priority>.*?<\\/priority>\\s*<\\/url>\\s*`,
        'i'
      );
      cleanedSitemapXml = cleanedSitemapXml.replace(urlPatternOld, '');
    }

    const formattedDate = new Date().toISOString().split('T')[0];
    const sitemapEntry = `  <url>
    <loc>https://novoxedtechllp.com/${newFilename}</loc>
    <lastmod>${formattedDate}</lastmod>
    <priority>0.8</priority>
  </url>\n`;

    const urlsetMarker = '</urlset>';
    const urlsetIndex = cleanedSitemapXml.indexOf(urlsetMarker);
    if (urlsetIndex === -1) {
      throw new Error('Could not find </urlset> inside sitemap.xml');
    }
    const updatedSitemapXml = cleanedSitemapXml.substring(0, urlsetIndex) + sitemapEntry + cleanedSitemapXml.substring(urlsetIndex);

    // Transaction Tree Commit via GitHub Git Data API
    const { data: refData } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const currentCommitSha = refData.object.sha;

    const { data: commitData } = await octokit.git.getCommit({ owner, repo, commit_sha: currentCommitSha });
    const currentTreeSha = commitData.tree.sha;

    const blobNewPage = await octokit.git.createBlob({ owner, repo, content: compiledPage, encoding: 'utf-8' });
    const blobBlogs = await octokit.git.createBlob({ owner, repo, content: updatedBlogsHtml, encoding: 'utf-8' });
    const blobSitemap = await octokit.git.createBlob({ owner, repo, content: updatedSitemapXml, encoding: 'utf-8' });

    const treeItems = [
      { path: newFilename, mode: '100644', type: 'blob', sha: blobNewPage.data.sha },
      { path: 'blogs.html', mode: '100644', type: 'blob', sha: blobBlogs.data.sha },
      { path: 'sitemap.xml', mode: '100644', type: 'blob', sha: blobSitemap.data.sha }
    ];

    if (original_filename && original_filename !== newFilename) {
      // Set sha to null to delete the old file in this Git Data transaction commit
      treeItems.push({
        path: original_filename,
        mode: '100644',
        type: 'blob',
        sha: null
      });
    }

    if (image_base64) {
      const blobImage = await octokit.git.createBlob({
        owner,
        repo,
        content: image_base64,
        encoding: 'base64'
      });
      treeItems.push({
        path: `assets/img/blog/new/${slug}.${imageExt}`,
        mode: '100644',
        type: 'blob',
        sha: blobImage.data.sha
      });
    }

    const { data: newTree } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: currentTreeSha,
      tree: treeItems
    });

    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message: `feat(blog): publish post "${title}"`,
      tree: newTree.sha,
      parents: [currentCommitSha]
    });

    await octokit.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: newCommit.sha });

    res.json({
      success: true,
      commit_sha: newCommit.sha,
      commit_url: `https://github.com/${owner}/${repo}/commit/${newCommit.sha}`
    });

  } catch (error) {
    console.error('Error publishing blog:', error);
    res.status(500).json({ error: 'Failed to publish blog post: ' + error.message });
  }
});

// Route: Delete a Blog Post (HTML page, card from blogs.html, sitemap entry)
app.post('/api/blogs/:filename/delete', authenticate, async (req, res) => {
  const { filename } = req.params;
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!token || !owner || !repo) {
    return res.status(500).json({ error: 'GitHub Integration is not configured.' });
  }

  try {
    const octokit = new Octokit({ auth: token });
    console.log(`Starting deletion transaction for blog: ${filename}...`);

    // 1. Fetch blogs.html
    const blogsRes = await octokit.repos.getContent({ owner, repo, path: 'blogs.html', ref: branch });
    const blogsHtml = Buffer.from(blogsRes.data.content, 'base64').toString('utf8');

    // 2. Parse existing cards in blogs.html
    const gridMarker = '<div class="row grid">';
    const gridIndex = blogsHtml.indexOf(gridMarker);
    if (gridIndex === -1) {
      throw new Error('Could not find blog grid container inside blogs.html');
    }
    
    let depth = 1;
    let scanPos = gridIndex + gridMarker.length;
    let gridEndPos = -1;
    
    while (scanPos < blogsHtml.length) {
      const nextOpen = blogsHtml.indexOf('<div', scanPos);
      const nextClose = blogsHtml.indexOf('</div', scanPos);
      
      if (nextOpen === -1 && nextClose === -1) break;
      
      if (nextOpen !== -1 && (nextClose === -1 || nextOpen < nextClose)) {
        depth++;
        scanPos = nextOpen + 4;
      } else {
        depth--;
        scanPos = nextClose + 6; // Include full </div>
        if (depth === 0) {
          gridEndPos = scanPos;
          break;
        }
      }
    }
    
    if (gridEndPos === -1) {
      throw new Error('Could not find matching end of the grid div in blogs.html');
    }

    const gridContent = blogsHtml.substring(gridIndex + gridMarker.length, gridEndPos - 6);
    let cards = parseBlogCards(gridContent);

    // 3. Filter out the deleted blog card
    cards = cards.filter(c => c.filename !== filename);

    // Rebuild grid content
    const updatedGridContent = '\n' + cards.map(c => c.html).join('\n') + '\n';
    const updatedBlogsHtml = blogsHtml.substring(0, gridIndex + gridMarker.length) + updatedGridContent + blogsHtml.substring(gridEndPos - 6);

    // 4. Fetch sitemap.xml
    const sitemapRes = await octokit.repos.getContent({ owner, repo, path: 'sitemap.xml', ref: branch });
    const sitemapXml = Buffer.from(sitemapRes.data.content, 'base64').toString('utf8');

    // Remove entry from sitemap
    const escapedLoc = `https://novoxedtechllp.com/${filename}`.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const urlPattern = new RegExp(
      `<url>\\s*<loc>${escapedLoc}<\\/loc>\\s*<lastmod>.*?<\\/lastmod>\\s*<priority>.*?<\\/priority>\\s*<\\/url>\\s*`,
      'i'
    );
    const updatedSitemapXml = sitemapXml.replace(urlPattern, '');

    // 5. Create transaction and push tree to GitHub Git Data API
    const { data: refData } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const currentCommitSha = refData.object.sha;

    const { data: commitData } = await octokit.git.getCommit({ owner, repo, commit_sha: currentCommitSha });
    const currentTreeSha = commitData.tree.sha;

    // Create blobs for modified sitemap and blogs.html
    const blobBlogs = await octokit.git.createBlob({ owner, repo, content: updatedBlogsHtml, encoding: 'utf-8' });
    const blobSitemap = await octokit.git.createBlob({ owner, repo, content: updatedSitemapXml, encoding: 'utf-8' });

    // Build the tree items (modify blogs/sitemap, delete the HTML file)
    const treeItems = [
      { path: 'blogs.html', mode: '100644', type: 'blob', sha: blobBlogs.data.sha },
      { path: 'sitemap.xml', mode: '100644', type: 'blob', sha: blobSitemap.data.sha },
      { path: filename, mode: '100644', type: 'blob', sha: null } // Deletes the file
    ];

    const { data: newTree } = await octokit.git.createTree({
      owner,
      repo,
      base_tree: currentTreeSha,
      tree: treeItems
    });

    const { data: newCommit } = await octokit.git.createCommit({
      owner,
      repo,
      message: `feat(blog): delete post "${filename}"`,
      tree: newTree.sha,
      parents: [currentCommitSha]
    });

    await octokit.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: newCommit.sha });

    res.json({
      success: true,
      commit_sha: newCommit.sha,
      commit_url: `https://github.com/${owner}/${repo}/commit/${newCommit.sha}`
    });

  } catch (error) {
    console.error('Error deleting blog:', error);
    res.status(500).json({ error: 'Failed to delete blog: ' + error.message });
  }
});

// API: Proxy image from GitHub (handling private repo tokens)
app.get('/api/blogs-image', async (req, res) => {
  const { path: imagePath } = req.query;
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!imagePath) {
    return res.status(400).json({ error: 'Missing image path parameter' });
  }

  if (!token || !owner || !repo) {
    return res.status(500).json({ error: 'GitHub Integration is not configured.' });
  }

  try {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${imagePath}`;
    console.log(`Proxying image from GitHub raw: ${url}...`);
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`GitHub raw returned status ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    let contentType = 'image/png';
    if (imagePath.toLowerCase().endsWith('.jpg') || imagePath.toLowerCase().endsWith('.jpeg')) {
      contentType = 'image/jpeg';
    } else if (imagePath.toLowerCase().endsWith('.gif')) {
      contentType = 'image/gif';
    } else if (imagePath.toLowerCase().endsWith('.svg')) {
      contentType = 'image/svg+xml';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (error) {
    console.error('Error proxying image via raw url:', error.message);
    res.status(500).json({ error: 'Failed to fetch image: ' + error.message });
  }
});

// API: List all existing blogs
app.get('/api/blogs', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!token || !owner || !repo) {
    return res.status(500).json({ error: 'GitHub Integration is not configured.' });
  }

  try {
    const octokit = new Octokit({ auth: token });
    console.log(`Listing files in repo root: ${owner}/${repo}...`);
    const filesRes = await octokit.repos.getContent({
      owner,
      repo,
      path: '',
      ref: branch,
      headers: {
        'If-None-Match': '',
        'Cache-Control': 'no-cache'
      }
    });
    
    if (!Array.isArray(filesRes.data)) {
      return res.json([]);
    }

    const excludeFiles = [
      'index.html', 'about.html', 'contact.html', 'blogs.html', 'courses.html', 
      'placement.html', 'gallery.html', 'instructor.html', 'blog-template-v2.html', 
      'blog-template.html', 'terms-conditions.html', 'temp_cards.html', 'full-stack-roadmap.html',
      'sitemap.xml', 'package.json', 'package-lock.json', '.gitignore'
    ];

    const blogs = filesRes.data
      .filter(file => {
        const name = file.name.toLowerCase();
        return (
          file.type === 'file' &&
          name.endsWith('.html') &&
          !excludeFiles.includes(name) &&
          !name.endsWith('-course-detail.html')
        );
      })
      .map(file => ({
        filename: file.name,
        sha: file.sha,
        size: file.size
      }));

    res.json(blogs);
  } catch (error) {
    console.error('Error fetching blogs list:', error);
    res.status(500).json({ error: 'Failed to fetch blogs list: ' + error.message });
  }
});

// API: Get details of a specific blog for editing
app.get('/api/blogs/:filename', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const { filename } = req.params;
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  const branch = process.env.GITHUB_BRANCH || 'main';

  if (!token || !owner || !repo) {
    return res.status(500).json({ error: 'GitHub Integration is not configured.' });
  }

  try {
    const octokit = new Octokit({ auth: token });
    console.log(`Fetching blog content: ${filename}...`);
    const fileRes = await octokit.repos.getContent({
      owner,
      repo,
      path: filename,
      ref: branch,
      headers: {
        'If-None-Match': '',
        'Cache-Control': 'no-cache'
      }
    });
    
    const html = Buffer.from(fileRes.data.content, 'base64').toString('utf8');

    // 1. Extract Title
    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // 2. Extract Description
    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i) || 
                      html.match(/<meta\s+content=["'](.*?)["']\s+name=["']description["']/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // 3. Extract Category
    const categoryMatch = html.match(/<span\s+class=["']modern-badge["'][^>]*>(.*?)<\/span>/i) ||
                          html.match(/<span\s+style=["'][^"']*["']\s+class=["']modern-badge["'][^>]*>(.*?)<\/span>/i);
    const category = categoryMatch ? categoryMatch[1].replace(/<[^>]*>/g, '').trim() : 'Tech & Programming';

    // 4. Extract Author, Date and Image path from blogs.html grid card
    let author = 'Novox Expert';
    let date = '';
    let imageFromBlogsHtml = '';

    try {
      const blogsRes = await octokit.repos.getContent({
        owner,
        repo,
        path: 'blogs.html',
        ref: branch,
        headers: {
          'If-None-Match': '',
          'Cache-Control': 'no-cache'
        }
      });
      const blogsHtml = Buffer.from(blogsRes.data.content, 'base64').toString('utf8');
      
      const escapedFilename = filename.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const cardRegex = new RegExp(
        `<div\\s+class=["'][^"']*grid-item[^"']*["']>[\\s\\S]*?href=["']${escapedFilename}["'][\\s\\S]*?<span\\s+class=["']modern-date author-span["'][^>]*>([\\s\\S]*?)<\\/span>\\s*<span\\s+class=["']modern-date["'][^>]*>([\\s\\S]*?)<\\/span>`,
        'i'
      );
      const cardMatch = blogsHtml.match(cardRegex);
      if (cardMatch) {
        author = cardMatch[1].trim();
        date = cardMatch[2].trim();
      }

      const imgCardRegex = new RegExp(
        `<div\\s+class=["'][^"']*grid-item[^"']*["']>[\\s\\S]*?href=["']${escapedFilename}["'][\\s\\S]*?<img\\s+[^>]*src=["']([^"']+)["']`,
        'i'
      );
      const imgCardMatch = blogsHtml.match(imgCardRegex);
      if (imgCardMatch) {
        imageFromBlogsHtml = imgCardMatch[1].trim();
      }
    } catch (blogsErr) {
      console.warn('Could not read details from blogs.html:', blogsErr.message);
    }

    // Fallback to extraction from individual page spans if date not found in blogs.html
    if (!date) {
      const pageDateMatch = html.match(/<i\s+[^>]*class=["'][^"']*calendar-days[^"']*["'][^>]*><\/i>\s*([^<]+)/i) ||
                            html.match(/<span[^>]*>\s*<i\s+[^>]*class=["'][^"']*calendar-days[^"']*["'][^>]*><\/i>\s*([^<]+)/i) ||
                            html.match(/<span\s+class=["']modern-date["'][^>]*>(.*?)<\/span>/gi);
      if (pageDateMatch) {
        if (Array.isArray(pageDateMatch) && pageDateMatch.length > 0) {
          const lastSpan = pageDateMatch[pageDateMatch.length - 1];
          const match = lastSpan.match(/>([^<]+)</);
          if (match) date = match[1].trim();
        } else if (pageDateMatch[1]) {
          date = pageDateMatch[1].trim();
        }
      }
    }

    if (!author || author === 'Novox Expert') {
      const pageAuthorMatch = html.match(/<i\s+[^>]*class=["'][^"']*user[^"']*["'][^>]*><\/i>\s*(?:By\s+)?([^<]+)/i) ||
                              html.match(/<span[^>]*>\s*<i\s+[^>]*class=["'][^"']*user[^"']*["'][^>]*><\/i>\s*(?:By\s+)?([^<]+)/i) ||
                              html.match(/<span\s+class=["']modern-date author-span["'][^>]*>(.*?)<\/span>/i);
      if (pageAuthorMatch) {
        author = pageAuthorMatch[1].replace(/<[^>]*>/g, '').replace(/By\s+/i, '').trim();
      }
    }

    // 5. Extract Featured Image
    let image = imageFromBlogsHtml;
    if (!image) {
      // Locate the main content wrapper to avoid extracting header/menu/offcanvas images
      let wrapperHtml = '';
      const wrapperMatch = html.match(/<div\s+class=["'](?:tp-)?(?:blog-details|postbox)-wrapper[^"']*["']>([\s\S]*?)$/i);
      if (wrapperMatch) {
        wrapperHtml = wrapperMatch[1];
      } else {
        const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
        if (mainMatch) wrapperHtml = mainMatch[1];
      }

      if (wrapperHtml) {
        const imgMatch = wrapperHtml.match(/<div\s+class=["'](?:tp-)?(?:postbox-details-)?(?:blog-details-)?thumb[^"']*["'][^>]*>\s*<img\s+[^>]*src=["']([^"']+)["']/i) ||
                         wrapperHtml.match(/<img\s+[^>]*src=["']([^"']+)["']/i);
        if (imgMatch) {
          image = imgMatch[1].trim();
        }
      }
      
      if (!image) {
        image = 'assets/img/blog/blogimages/technologytrendblog.jpg';
      }
    }

    // 6. Extract Content HTML
    const contentNormalized = html.replace(/\r\n/g, '\n');
    const startKey = '<div class="blog-details-content">';
    const endKey = '</div>\n                  </div>\n               </div>\n            </div>\n         </div>\n      </section>\n   </main>';

    const startIndex = contentNormalized.indexOf(startKey);
    const endIndex = contentNormalized.indexOf(endKey, startIndex);

    let content_html = '';
    if (startIndex !== -1 && endIndex !== -1) {
      content_html = contentNormalized.substring(startIndex + startKey.length, endIndex).trim();
    } else {
      // Fallback loose match
      const looseStart = contentNormalized.indexOf('<div class="blog-details-content">');
      if (looseStart !== -1) {
        const looseEnd = contentNormalized.indexOf('</section>', looseStart);
        if (looseEnd !== -1) {
          content_html = contentNormalized.substring(looseStart + 34, looseEnd).trim();
          content_html = content_html.replace(/<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*$/i, '').trim();
        }
      }

      // Fallback old wrapper structure match
      if (!content_html) {
        const wrapperIndex = contentNormalized.indexOf('<div class="tp-postbox-wrapper">');
        if (wrapperIndex !== -1) {
          const thumbStart = contentNormalized.indexOf('<div class="tp-postbox-details-thumb', wrapperIndex);
          let contentSearchStart = wrapperIndex + 32;
          if (thumbStart !== -1) {
            const thumbEnd = contentNormalized.indexOf('</div>', thumbStart);
            if (thumbEnd !== -1) {
              contentSearchStart = thumbEnd + 6;
            }
          }

          let contentEnd = contentNormalized.indexOf('<div class="tp-postbox-comment-from"', contentSearchStart);
          if (contentEnd === -1) {
            contentEnd = contentNormalized.indexOf('</div>\n                     </div>\n                  </div>\n               </div>\n            </div>\n         </section>');
          }
          if (contentEnd === -1) {
             contentEnd = contentNormalized.indexOf('</section>', contentSearchStart);
          }

          if (contentEnd !== -1 && contentEnd > contentSearchStart) {
            let extracted = contentNormalized.substring(contentSearchStart, contentEnd).trim();
            
            // Clean up old layout containers (tp-postbox-details-text wrapper tags)
            // 1. Merge boundaries between adjacent blocks
            extracted = extracted.replace(/<\/div>\s*<div\s+class=["']tp-postbox-details-text[^"']*["']>/gi, '\n');
            // 2. Strip leading wrapper tag if present
            extracted = extracted.replace(/^<div\s+class=["']tp-postbox-details-text[^"']*["']>\s*/i, '');
            // 3. Strip trailing closing tag if present
            extracted = extracted.trim();
            if (extracted.endsWith('</div>')) {
              extracted = extracted.substring(0, extracted.length - 6).trim();
            }
            
            content_html = extracted;
          }
        }
      }
    }

    // Clean title (strip " | Novox Edtech" at the end if present)
    const cleanedTitle = title.replace(/\s*\|\s*Novox\s*Edtech\s*$/i, '');

    // Extract landing course URL
    const linkMatch = html.match(/<a\s+[^>]*href=["']([^"']+-course-detail\.html)["']/i);
    const landing_url = linkMatch ? linkMatch[1] : 'mern-stack-course-detail.html';

    // Deduce target keyword using frequency and matching logic
    let keyword = '';
    const bodyText = content_html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const cleanTitleLower = cleanedTitle.toLowerCase().replace(/[^\w\s-]/g, '');
    const bodySentences = bodyText.split(/[.!?]/).map(s => s.trim()).filter(s => s.length > 0);
    const introText = bodySentences.slice(0, 3).join(' ');

    if (introText) {
      const titleWords = cleanTitleLower.split(/\s+/).filter(w => w.length > 2);
      let bestPhrase = '';
      let maxCount = 0;

      // Look for matching phrases of length 2 to 4 words from the title in the intro text
      for (let len = 2; len <= 4; len++) {
        for (let i = 0; i <= titleWords.length - len; i++) {
          const phrase = titleWords.slice(i, i + len).join(' ');
          if (introText.toLowerCase().includes(phrase)) {
            const regex = new RegExp('\\b' + phrase.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'gi');
            const count = (bodyText.match(regex) || []).length;
            if (count > maxCount) {
              maxCount = count;
              bestPhrase = phrase;
            }
          }
        }
      }

      if (bestPhrase) {
        keyword = bestPhrase;
      }
    }

    // Fallback if no phrase match found: first 3 words of title
    if (!keyword) {
      const words = cleanedTitle.split(/\s+/).filter(w => w.length > 0);
      keyword = words.slice(0, Math.min(3, words.length)).join(' ');
    }

    const raw_image_url = `/api/blogs-image?path=${encodeURIComponent(image)}`;

    res.json({
      title: cleanedTitle,
      description,
      category,
      author,
      date,
      image,
      raw_image_url,
      content_html,
      slug: filename.replace('.html', ''),
      landing_url,
      keyword
    });
  } catch (error) {
    console.error('Error fetching blog details:', error);
    res.status(500).json({ error: 'Failed to fetch blog details: ' + error.message });
  }
});

// Run server
app.listen(PORT, () => {
  console.log(`Novox Blog Admin server is running on http://localhost:${PORT}`);
});
