import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { Octokit } from '@octokit/rest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Load sites configuration
let sitesConfig = {};
try {
  const configPath = path.join(__dirname, 'sites.config.json');
  sitesConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  console.log('Loaded sites configuration for:', Object.keys(sitesConfig).join(', '));
} catch (err) {
  console.error('Failed to load sites.config.json:', err.message);
}

// Authentication Middleware (Enabled)
const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const customHeader = req.headers['x-passcode'];
  
  let passcode = '';
  if (customHeader) {
    passcode = customHeader;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    passcode = authHeader.substring(7);
  }
  
  const expectedPasscode = process.env.ADMIN_PASSCODE || 'novox2026';
  
  if (passcode === expectedPasscode) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized: Invalid passcode' });
  }
};

// Route: Verify Passcode
app.post('/api/verify-passcode', (req, res) => {
  const { passcode } = req.body;
  const expectedPasscode = process.env.ADMIN_PASSCODE || 'novox2026';
  if (passcode === expectedPasscode) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid passcode' });
  }
});

// Helper: Get site config from header or query
function getSiteConfig(req) {
  const siteId = req.headers['x-site-id'] || req.query.siteId || 'novox_edtech';
  const config = sitesConfig[siteId];
  if (!config) {
    throw new Error(`Site configuration not found for site ID: ${siteId}`);
  }
  return { siteId, config };
}

// Helper: Get GitHub credentials for a given site config
function getGitCredentials(config) {
  const owner = process.env[config.git.ownerEnvVar] || process.env.GITHUB_OWNER;
  const repo = process.env[config.git.repoEnvVar] || process.env.GITHUB_REPO;
  const branch = process.env[config.git.branchEnvVar] || process.env.GITHUB_BRANCH || 'main';
  const token = process.env[config.git.tokenEnvVar] || process.env.GITHUB_TOKEN;
  return { owner, repo, branch, token };
}

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

// API: Get active sites config profiles for UI
app.get('/api/config', authenticate, (req, res) => {
  res.json(sitesConfig);
});

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
    const { siteId, config } = getSiteConfig(req);
    const ai = new GoogleGenAI({ apiKey });
    
    const headingTag = config.seo.headingTag || 'h2';
    const subheadingTag = config.seo.subheadingTag || 'h3';
    const categoriesJson = JSON.stringify(config.categories);
    
    let faqInstructions = '';
    if (config.seo.requireFaq) {
      faqInstructions = `- Provide a distinct "Frequently Asked Questions" section before closure. Under this section, wrap each question in <${subheadingTag}> and answer in <p>.`;
    } else {
      faqInstructions = `- Do NOT include a Frequently Asked Questions (FAQ) section in this article.`;
    }

    const prompt = `You are a professional copywriter for ${config.displayName} (${config.niche}).
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
- Focus the content topic on student career benefits, business growth, digital efficiency, or industry trends matching the company's niche: ${config.niche}.
- Structure the sub-sections using semantic HTML <${headingTag}> and <${subheadingTag}> tags.
${faqInstructions}
- Terminate with a strong conclusion summary paragraph under an explicit "<${headingTag}>Conclusion</${headingTag}>" (or "<${headingTag}>Summary</${headingTag}>") heading.
- Add 1-2 natural inline internal hyperlinks inside the body paragraphs linking relevant categories/services phrases to target pages. Wrap the phrase in an anchor tag using the exact placeholder string "{{COURSE_URL}}" as the href attribute. Refer to this list of valid category targets: ${categoriesJson}
- Add an explicit standalone Call-to-Action (CTA) link mapping to the contact page ("contact.html") at the very end. The CTA must be styled exactly like this HTML structure:
${config.seo.ctaHtml}
Do NOT output a simple inline text anchor for the main CTA. It must use the exact outer wrappers, styles, and classes specified.
- Ensure the primary target keyword appears at least 4 times in the text (naturally spread across paragraphs).

Ensure the response matches application/json mime-type and contains valid, parsing JSON.`;

    const contentModels = [
      'gemini-2.5-flash',
      'gemini-2.5-pro',
      'gemini-2.0-flash-001',
      'gemini-2.0-flash-lite',
      'gemini-3.5-flash'
    ];
    let response;
    let lastErr;
    let selectedModel = '';

    for (const model of contentModels) {
      try {
        console.log(`Attempting content generation with model: ${model} for site: ${siteId}...`);
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
        break; 
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
      const imagePrompt = `A premium tech-concept digital illustration or 3D render representing '${parsedResult.title}'. Modern corporate style, vibrant highlights, dark background, professional graphic design.`;
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
    const imagePrompt = `A premium tech-concept digital illustration or 3D render representing '${title}'. Modern corporate style, vibrant highlights, dark background, professional graphic design.`;
    
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

// Helper to parse card structures from grid page HTML content
function parseBlogCards(gridContent, siteId) {
  const cards = [];
  let pos = 0;
  
  if (siteId === 'novox_core') {
    while (true) {
      const nextAnchorStart = gridContent.indexOf('<a href=', pos);
      if (nextAnchorStart === -1) break;
      
      const nextAnchorEnd = gridContent.indexOf('</a>', nextAnchorStart);
      if (nextAnchorEnd === -1) break;
      
      const cardHtml = gridContent.substring(nextAnchorStart, nextAnchorEnd + 4);
      
      const hrefMatch = cardHtml.match(/href=["']([^"']+\.html)["']/i);
      const filename = hrefMatch ? hrefMatch[1] : '';
      
      const titleMatch = cardHtml.match(/<h2\s+class=["']title["'][^>]*>([\s\S]*?)(?:<span\s+class=["']arrow["']|$)/i);
      let title = titleMatch ? titleMatch[1].trim() : '';
      title = title.replace(/^[“"']/g, '').replace(/[”"']$/g, '').replace(/<[^>]*>/g, '').trim();
      
      const authorMatch = cardHtml.match(/<span\s+class=["']name["'][^>]*>By\s*<span>([\s\S]*?)<\/span>/i);
      const author = authorMatch ? authorMatch[1].trim() : 'Novoxed Tech LLP';
      
      const dateMatch = cardHtml.match(/<span\s+class=["']date has-left-line["'][^>]*>([\s\S]*?)<\/span>/i);
      const dateText = dateMatch ? dateMatch[1].trim() : '';
      
      cards.push({
        html: cardHtml.trim(),
        filename,
        title,
        dateStr: dateText,
        dateVal: parseBlogDate(dateText)
      });
      
      pos = nextAnchorEnd + 4;
    }
  } else {
    // Novox EdTech parsing
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
          scanPos = nextClose + 6;
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
  }
  
  return cards;
}

// Helper: Compile the grid HTML card for a site ID
function compileBlogCard(siteId, title, newFilename, finalImageName, category, author, date, badgeStyle, categoryClass) {
  if (siteId === 'novox_core') {
    return `                  <a href="${newFilename}">
                    <article class="blog fade-anim" data-delay="0.15">
                      <div class="thumb">
                        <img src="${finalImageName}" alt="${title}">
                      </div>
                      <div class="content-wrapper">
                        <div class="content">
                          <h2 class="title">“${title}”
                            <span class="arrow">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 13 14" fill="none">
                                <path fill-rule="evenodd" clip-rule="evenodd"
                                  d="M8.98834 0.661257C8.91884 0.781628 8.85302 0.903885 8.79094 1.02786C8.47298 1.49122 8.0835 1.90234 7.63629 2.2455C7.07879 2.67328 6.4425 2.98707 5.76373 3.16894C5.08497 3.35082 4.37702 3.39722 3.68033 3.3055C2.98363 3.21377 2.31182 2.98572 1.70325 2.63437L0.869521 4.07843C1.66772 4.53928 2.54888 4.83839 3.46268 4.95869C4.37648 5.079 5.30502 5.01814 6.1953 4.77959C6.36565 4.73394 6.53397 4.68196 6.6999 4.62381L2.03475 12.7041L3.47584 13.5361L8.16052 5.42201C8.19489 5.61171 8.23713 5.80022 8.28719 5.98704C8.52574 6.87732 8.9373 7.71189 9.49839 8.44311C10.0595 9.17433 10.7591 9.78788 11.5573 10.2487L12.391 8.80466C11.7825 8.4533 11.2491 7.98552 10.8213 7.42803C10.3935 6.87053 10.0797 6.23423 9.89783 5.55547C9.71595 4.8767 9.66955 4.16876 9.76128 3.47206C9.83484 2.91326 9.99611 2.37047 10.2384 1.86349C10.3146 1.74781 10.3875 1.62977 10.457 1.50948L10.4323 1.49521L10.4324 1.49499L8.98834 0.661257Z"
                                  fill="#111111" />
                              </svg>
                            </span>
                          </h2>
                          <div class="meta">
                            <span class="name">By <span>${author}</span></span>
                            <span class="date has-left-line">${date}</span>
                          </div>
                        </div>
                      </div>
                    </article>
                  </a>`;
  } else {
    return `               <!-- Post: ${title} -->
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
  }
}

// Helper: Get Category Style details (EdTech only)
function getCategoryStyle(catName) {
  const styleMap = {
    'Tech & Programming': ['cat-tech', 'background:#fee2e2; color:#b91c1c;'],
    'Career & Placement': ['cat-career', 'background:#fce7f3; color:#be185d;'],
    'Digital Marketing': ['cat-marketing', 'background:#d1fae5; color:#065f46;'],
    'Web Development': ['cat-web', 'background:#dcfce7; color:#166534;'],
    'App Development': ['cat-app', 'background:#e0f2fe; color:#0369a1;'],
    'Design': ['cat-design', 'background:#fef3c7; color:#d97706;'],
    'Artificial Intelligence': ['cat-ai', 'background:#e0e7ff; color:#4338ca;'],
    'Student & Learning': ['cat-student', 'background:#f3e8ff; color:#6b21a8;'],
    'Design & Development': ['cat-tech', 'background:#e0f2fe; color:#0369a1;'],
    'AI & Tech': ['cat-ai', 'background:#e0e7ff; color:#4338ca;'],
    'Careers & Team': ['cat-career', 'background:#fce7f3; color:#be185d;'],
    'Agency Insights': ['cat-student', 'background:#f3e8ff; color:#6b21a8;']
  };
  return styleMap[catName.trim()] || ['cat-tech', 'background:#fee2e2; color:#b91c1c;'];
}

// Helper: Parse details of a blog page card
function parseBlogCardForDetails(blogsHtml, filename, siteId) {
  let author = siteId === 'novox_core' ? 'Novoxed Tech LLP' : 'Novox Expert';
  let date = '';
  let imageFromBlogsHtml = '';

  const fileIndex = blogsHtml.indexOf(filename);
  if (fileIndex !== -1) {
    // Look a bit backward in case the image tag or card wrapper is slightly before the filename anchor
    const chunkStart = Math.max(0, fileIndex - 300);
    const cardChunk = blogsHtml.substring(chunkStart, fileIndex + 1500);

    if (siteId === 'novox_core') {
      const authorMatch = cardChunk.match(/<span\s+class=["']name["'][^>]*>By\s*<span>([\s\S]*?)<\/span>/i);
      if (authorMatch) {
        author = authorMatch[1].trim();
      }
      
      const dateMatch = cardChunk.match(/<span\s+class=["']date has-left-line["'][^>]*>([\s\S]*?)<\/span>/i);
      if (dateMatch) {
        date = dateMatch[1].trim();
      }
      
      const imgMatch = cardChunk.match(/<img\s+[^>]*src=["']([^"']+)["']/i);
      if (imgMatch) {
        imageFromBlogsHtml = imgMatch[1].trim();
      }
    } else {
      // EdTech
      const authorMatch = cardChunk.match(/<span\s+class=["']modern-date author-span["'][^>]*>([\s\S]*?)<\/span>/i);
      if (authorMatch) {
        author = authorMatch[1].trim();
      }
      
      const dateMatch = cardChunk.match(/<span\s+class=["']modern-date["'][^>]*>([\s\S]*?)<\/span>/i);
      if (dateMatch) {
        const matchedVal = dateMatch[1].trim();
        if (authorMatch && matchedVal === author) {
          // Find the second modern-date span which represents the date
          const secondMatch = cardChunk.substring(cardChunk.indexOf(dateMatch[0]) + dateMatch[0].length).match(/<span\s+class=["']modern-date["'][^>]*>([\s\S]*?)<\/span>/i);
          if (secondMatch) {
            date = secondMatch[1].trim();
          }
        } else {
          date = matchedVal;
        }
      }
      
      const imgMatch = cardChunk.match(/<img\s+[^>]*src=["']([^"']+)["']/i);
      if (imgMatch) {
        imageFromBlogsHtml = imgMatch[1].trim();
      }
    }
  }

  return { author, date, imageFromBlogsHtml };
}

// Route: Verify & Publish (Using GitHub API for cloud deployments)
app.post('/api/publish', authenticate, async (req, res) => {
  const { title, description, category, author, date, image, content_html, slug, landing_url, keyword, image_base64, original_filename } = req.body;

  if (!title || !description || !category || !author || !date || !image || !content_html || !slug || !landing_url || !keyword) {
    return res.status(400).json({ error: 'Missing required publication parameters' });
  }

  const isEdit = !!original_filename;
  let finalContentHtml = content_html;

  try {
    const { siteId, config } = getSiteConfig(req);
    const plainText = content_html.replace(/<[^>]*>/g, ' ');

    // 1. Run structural and SEO validations
    // Intro keyword check
    const sentences = plainText.split('.').map(s => s.trim()).filter(s => s.length > 0);
    const introText = sentences.slice(0, 3).join(' ').toLowerCase();
    if (!isEdit && !introText.includes(keyword.toLowerCase())) {
      return res.status(400).json({ error: `Validation Error: The target SEO keyword '${keyword}' must naturally exist in the introduction summary paragraph (first 3 sentences)!` });
    }

    // Keyword density check
    const regex = new RegExp(keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
    const kwMatches = plainText.match(regex) || [];
    if (!isEdit && kwMatches.length < 3) {
      return res.status(400).json({ error: `Validation Error: The targeted primary keyword '${keyword}' must appear at least 3 times in the text. Found ${kwMatches.length} times.` });
    }

    // No H1 check
    if (!isEdit && /<h1[^>]*>/i.test(content_html)) {
      return res.status(400).json({ error: "Validation Error: Semantic hierarchy mismatch. Do NOT include <h1> tags inside the content body." });
    }

    // Dynamic Heading tag check (H2 vs H4)
    const headingTag = config.seo.headingTag || 'h2';
    const headingRegex = new RegExp(`<${headingTag}[^>]*>`, 'gi');
    const headingMatches = content_html.match(headingRegex) || [];
    if (!isEdit && headingMatches.length < 2) {
      return res.status(400).json({ error: `Validation Error: Semantic hierarchy mismatch. Must include at least two <${headingTag.toUpperCase()}> subheadings. Found ${headingMatches.length}.` });
    }

    // FAQ check
    if (config.seo.requireFaq) {
      const faqPatterns = [/faq/i, /frequently asked questions/i, /doubt/i, /common question/i];
      const hasFaq = faqPatterns.some(pat => pat.test(plainText)) && new RegExp(`<${config.seo.subheadingTag || 'h3'}[^>]*>`, 'i').test(content_html);
      if (!isEdit && !hasFaq) {
        return res.status(400).json({ error: "Validation Error: Core structural mismatch. FAQ section is explicitly required before the end." });
      }
    }

    // Conclusion check
    if (config.seo.requireConclusion) {
      const conclusionPatterns = [/conclusion/i, /summary/i, /wrapping up/i, /final thoughts/i];
      const hasConclusion = conclusionPatterns.some(pat => pat.test(plainText));
      if (!isEdit && !hasConclusion) {
        return res.status(400).json({ error: "Validation Error: Core structural mismatch. A strong conclusion section is required." });
      }
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
      // Auto-inject a link on the first occurrence of a relevant keyword to heal the page structure
      const keywordsToLink = [
        'web development', 'software development', 'digital marketing', 'web design',
        'technology services', 'agency services', 'software agency', 'development services',
        'technology solutions', 'digital agency', 'technology', 'development', 'marketing', 'design'
      ];
      let linked = false;
      for (const kw of keywordsToLink) {
        const regex = new RegExp(`\\b(${kw})\\b`, 'i');
        if (regex.test(content_html)) {
          finalContentHtml = content_html.replace(regex, `<a href="{{COURSE_URL}}">$1</a>`);
          hasInternalLink = true;
          linked = true;
          break;
        }
      }
      if (!linked) {
        // Fallback: append a clean footer link
        finalContentHtml = content_html + `\n<p>To learn more, check out our <a href="{{COURSE_URL}}">services</a>.</p>`;
        hasInternalLink = true;
      }
    }

    // CTA check matching the company's styled button
    const ctaTextPatterns = config.seo.ctaTextPattern.map(p => new RegExp(p, 'i'));
    let hasCta = false;
    
    if (siteId === 'novox_core') {
      hasCta = new RegExp(`<a\\s+[^>]*class=["'][^"']*${config.seo.ctaAnchorClass}[^"']*["'][^>]*href=["']contact\\.html["']`, 'i').test(content_html);
    } else {
      const ctaContainerRegex = new RegExp(`<div\\s+[^>]*class=["'][^"']*${config.seo.ctaClass}[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, 'gis');
      let ctaContainerMatch;
      while ((ctaContainerMatch = ctaContainerRegex.exec(content_html)) !== null) {
        const innerHtml = ctaContainerMatch[1];
        const aRegex = new RegExp(`<a\\s+[^>]*class=["'][^"']*${config.seo.ctaAnchorClass}[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>`, 'gis');
        let aMatch;
        while ((aMatch = aRegex.exec(innerHtml)) !== null) {
          const href = aMatch[1];
          const text = aMatch[2].replace(/<[^>]*>/g, '').trim();
          if (href.includes('contact.html') || href === 'contact.html') {
            if (ctaTextPatterns.some(pat => pat.test(text))) {
              hasCta = true;
              break;
            }
          }
        }
        if (hasCta) break;
      }
    }

    if (!hasCta) {
      // Auto-inject default CTA button
      finalContentHtml = content_html + `\n` + config.seo.ctaHtml;
    }

  } catch (err) {
    if (!isEdit) {
      return res.status(400).json({ error: 'Validation Error: ' + err.message });
    }
  }

  try {
    const { siteId, config } = getSiteConfig(req);
    const { owner, repo, branch, token } = getGitCredentials(config);

    if (!token || !owner || !repo) {
      return res.status(500).json({ error: 'GitHub Integration is not configured for the active website.' });
    }

    const newFilename = `${slug}.html`;
    const octokit = new Octokit({ auth: token });

    // Fetch Template
    const templateRes = await octokit.repos.getContent({ owner, repo, path: config.files.template, ref: branch });
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
      .replaceAll('{{CONTENT}}', finalBodyHtml)
      .replaceAll('{{FILENAME}}', newFilename);

    // Dynamically replace hardcoded date and author in the template's meta section
    compiledPage = compiledPage.replace(
      /(<i\s+class=["']fa-light fa-calendar-days["']><\/i>)\s*[^<]+/gi,
      `$1 ${date}`
    );
    compiledPage = compiledPage.replace(
      /(<i\s+class=["']fa-light fa-user["']><\/i>)\s*(?:By\s+)?[^<]+/gi,
      `$1 By ${author}`
    );
    // Add support for core date & user spans
    compiledPage = compiledPage.replace(
      /(<span\s+class=["']date has-left-line["'][^>]*>)\s*[^<]+/gi,
      `$1${date}`
    );
    compiledPage = compiledPage.replace(
      /(<span\s+class=["']name["'][^>]*>By\s*<span>)\s*[^<]+/gi,
      `$1${author}`
    );

    // Append stateless metadata block at the bottom of the file
    const metaBlock = {
      keyword: keyword,
      landing_url: landing_url
    };
    compiledPage += `\n<!-- SEO_METADATA: ${JSON.stringify(metaBlock)} -->\n`;

    const gridPage = config.files.gridPage;

    // Fetch gridPage
    const blogsRes = await octokit.repos.getContent({ owner, repo, path: gridPage, ref: branch });
    const blogsHtml = Buffer.from(blogsRes.data.content, 'base64').toString('utf8');

    // Find grid container start and end in gridPage HTML
    const gridMarker = config.layout.gridMarker;
    const gridIndex = blogsHtml.indexOf(gridMarker);
    if (gridIndex === -1) {
      throw new Error(`Could not find blog grid container (${gridMarker}) inside ${gridPage}`);
    }
    
    // Find the end of the grid container by tracking matching div depth
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
        scanPos = nextClose + 6;
        if (depth === 0) {
          gridEndPos = scanPos;
          break;
        }
      }
    }
    
    if (gridEndPos === -1) {
      throw new Error(`Could not find matching end of the grid container in ${gridPage}`);
    }

    const gridContent = blogsHtml.substring(gridIndex + gridMarker.length, gridEndPos - 6);
    let cards = parseBlogCards(gridContent, siteId);

    // Compile the new card
    const [categoryClass, badgeStyle] = getCategoryStyle(category);
    const cardHtml = compileBlogCard(siteId, title, newFilename, finalImageName, category, author, date, badgeStyle, categoryClass);

    // Filter out any existing card for the same filename to prevent duplicates
    cards = cards.filter(c => c.filename !== newFilename && c.filename !== original_filename);

    // Add the new card
    cards.push({
      html: cardHtml,
      filename: newFilename,
      title: title,
      dateStr: date,
      dateVal: parseBlogDate(date)
    });

    // Sort cards chronologically (newest first)
    cards.sort((a, b) => b.dateVal.getTime() - a.dateVal.getTime());

    // Rebuild and inject the sorted grid content
    const updatedGridContent = '\n' + cards.map(c => c.html).join('\n') + '\n';
    const updatedBlogsHtml = blogsHtml.substring(0, gridIndex + gridMarker.length) + updatedGridContent + blogsHtml.substring(gridEndPos - 6);

    // Fetch sitemap.xml (with dynamic fallback if it does not exist)
    const sitemapPage = config.files.sitemap || 'sitemap.xml';
    let sitemapXml = '';
    try {
      const sitemapRes = await octokit.repos.getContent({ owner, repo, path: sitemapPage, ref: branch });
      sitemapXml = Buffer.from(sitemapRes.data.content, 'base64').toString('utf8');
    } catch (sitemapErr) {
      if (sitemapErr.status === 404) {
        console.warn(`Sitemap ${sitemapPage} not found, initializing a new one.`);
        sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>`;
      } else {
        throw sitemapErr;
      }
    }

    // Clean old sitemap entry if it exists to avoid duplication during edits
    let cleanedSitemapXml = sitemapXml;
    const domainBase = config.domain;
    
    const escapedLocNew = `${domainBase}/${newFilename}`.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const urlPatternNew = new RegExp(
      `<url>\\s*<loc>${escapedLocNew}<\\/loc>\\s*<lastmod>.*?<\\/lastmod>\\s*<priority>.*?<\\/priority>\\s*<\\/url>\\s*`,
      'i'
    );
    cleanedSitemapXml = cleanedSitemapXml.replace(urlPatternNew, '');

    if (original_filename && original_filename !== newFilename) {
      const escapedLocOld = `${domainBase}/${original_filename}`.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const urlPatternOld = new RegExp(
        `<url>\\s*<loc>${escapedLocOld}<\\/loc>\\s*<lastmod>.*?<\\/lastmod>\\s*<priority>.*?<\\/priority>\\s*<\\/url>\\s*`,
        'i'
      );
      cleanedSitemapXml = cleanedSitemapXml.replace(urlPatternOld, '');
    }

    const formattedDate = new Date().toISOString().split('T')[0];
    const sitemapEntry = `  <url>
    <loc>${domainBase}/${newFilename}</loc>
    <lastmod>${formattedDate}</lastmod>
    <priority>0.8</priority>
  </url>\n`;

    const urlsetMarker = '</urlset>';
    const urlsetIndex = cleanedSitemapXml.indexOf(urlsetMarker);
    if (urlsetIndex === -1) {
      throw new Error(`Could not find </urlset> inside ${sitemapPage}`);
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
      { path: gridPage, mode: '100644', type: 'blob', sha: blobBlogs.data.sha },
      { path: sitemapPage, mode: '100644', type: 'blob', sha: blobSitemap.data.sha }
    ];

    if (original_filename && original_filename !== newFilename) {
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
      message: `feat(blog): publish post "${title}" to ${config.displayName}`,
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

// Route: Delete a Blog Post (HTML page, card, sitemap entry)
app.post('/api/blogs/:filename/delete', authenticate, async (req, res) => {
  const { filename } = req.params;

  try {
    const { siteId, config } = getSiteConfig(req);
    const { owner, repo, branch, token } = getGitCredentials(config);

    if (!token || !owner || !repo) {
      return res.status(500).json({ error: 'GitHub Integration is not configured for the active website.' });
    }

    const octokit = new Octokit({ auth: token });
    console.log(`Starting deletion transaction for blog: ${filename} on ${config.displayName}...`);

    const gridPage = config.files.gridPage;

    // Fetch gridPage
    const blogsRes = await octokit.repos.getContent({ owner, repo, path: gridPage, ref: branch });
    const blogsHtml = Buffer.from(blogsRes.data.content, 'base64').toString('utf8');

    // Parse existing cards in gridPage
    const gridMarker = config.layout.gridMarker;
    const gridIndex = blogsHtml.indexOf(gridMarker);
    if (gridIndex === -1) {
      throw new Error(`Could not find blog grid container inside ${gridPage}`);
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
        scanPos = nextClose + 6;
        if (depth === 0) {
          gridEndPos = scanPos;
          break;
        }
      }
    }
    
    if (gridEndPos === -1) {
      throw new Error(`Could not find matching end of the grid container in ${gridPage}`);
    }

    const gridContent = blogsHtml.substring(gridIndex + gridMarker.length, gridEndPos - 6);
    let cards = parseBlogCards(gridContent, siteId);

    // Filter out the deleted blog card
    cards = cards.filter(c => c.filename !== filename);

    // Rebuild grid content
    const updatedGridContent = '\n' + cards.map(c => c.html).join('\n') + '\n';
    const updatedBlogsHtml = blogsHtml.substring(0, gridIndex + gridMarker.length) + updatedGridContent + blogsHtml.substring(gridEndPos - 6);

    // Fetch sitemap
    const sitemapPage = config.files.sitemap || 'sitemap.xml';
    let sitemapXml = '';
    try {
      const sitemapRes = await octokit.repos.getContent({ owner, repo, path: sitemapPage, ref: branch });
      sitemapXml = Buffer.from(sitemapRes.data.content, 'base64').toString('utf8');
    } catch (sitemapErr) {
      if (sitemapErr.status === 404) {
        console.warn(`Sitemap ${sitemapPage} not found during delete, skipping clean.`);
        sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>`;
      } else {
        throw sitemapErr;
      }
    }

    // Remove entry from sitemap
    const escapedLoc = `${config.domain}/${filename}`.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const urlPattern = new RegExp(
      `<url>\\s*<loc>${escapedLoc}<\\/loc>\\s*<lastmod>.*?<\\/lastmod>\\s*<priority>.*?<\\/priority>\\s*<\\/url>\\s*`,
      'i'
    );
    const updatedSitemapXml = sitemapXml.replace(urlPattern, '');

    // Create transaction tree
    const { data: refData } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const currentCommitSha = refData.object.sha;

    const { data: commitData } = await octokit.git.getCommit({ owner, repo, commit_sha: currentCommitSha });
    const currentTreeSha = commitData.tree.sha;

    const blobBlogs = await octokit.git.createBlob({ owner, repo, content: updatedBlogsHtml, encoding: 'utf-8' });
    const blobSitemap = await octokit.git.createBlob({ owner, repo, content: updatedSitemapXml, encoding: 'utf-8' });

    const treeItems = [
      { path: gridPage, mode: '100644', type: 'blob', sha: blobBlogs.data.sha },
      { path: sitemapPage, mode: '100644', type: 'blob', sha: blobSitemap.data.sha },
      { path: filename, mode: '100644', type: 'blob', sha: null } 
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
      message: `feat(blog): delete post "${filename}" from ${config.displayName}`,
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

  if (!imagePath) {
    return res.status(400).json({ error: 'Missing image path parameter' });
  }

  try {
    const { siteId, config } = getSiteConfig(req);
    const { owner, repo, branch, token } = getGitCredentials(config);

    if (!token || !owner || !repo) {
      return res.status(500).json({ error: 'GitHub Integration is not configured for the active website.' });
    }

    let normalizedPath = imagePath;
    if (siteId === 'novox_core' && imagePath.toLowerCase().startsWith('images/')) {
      normalizedPath = imagePath.replace(/^images\//i, 'Images/');
    }

    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${normalizedPath}`;
    console.log(`Proxying image for ${siteId} from GitHub raw: ${url}...`);
    
    let response = await fetch(url, {
      headers: {
        'Authorization': `token ${token}`
      }
    });

    if (!response.ok && response.status === 404) {
      let altPath = null;
      if (imagePath.startsWith('images/')) {
        altPath = 'Images/' + imagePath.substring(7);
      } else if (imagePath.startsWith('Images/')) {
        altPath = 'images/' + imagePath.substring(7);
      } else if (imagePath.includes('/images/')) {
        altPath = imagePath.replace('/images/', '/Images/');
      } else if (imagePath.includes('/Images/')) {
        altPath = imagePath.replace('/Images/', '/images/');
      }

      if (altPath) {
        const altUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${altPath}`;
        console.log(`Proxying image (alt case correction) for ${siteId} from GitHub raw: ${altUrl}...`);
        const altResponse = await fetch(altUrl, {
          headers: {
            'Authorization': `token ${token}`
          }
        });
        if (altResponse.ok) {
          response = altResponse;
        }
      }
    }

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
app.get('/api/blogs', authenticate, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  try {
    const { siteId, config } = getSiteConfig(req);
    const { owner, repo, branch, token } = getGitCredentials(config);

    if (!token || !owner || !repo) {
      return res.status(500).json({ error: 'GitHub Integration is not configured for the active website.' });
    }

    const octokit = new Octokit({ auth: token });
    const gridPage = config.files.gridPage;
    console.log(`Listing blogs from grid page: ${gridPage} for site: ${siteId}...`);
    
    const blogsRes = await octokit.repos.getContent({
      owner,
      repo,
      path: gridPage,
      ref: branch,
      headers: {
        'If-None-Match': '',
        'Cache-Control': 'no-cache'
      }
    });

    const blogsHtml = Buffer.from(blogsRes.data.content, 'base64').toString('utf8');
    const gridMarker = config.layout.gridMarker;
    const gridIndex = blogsHtml.indexOf(gridMarker);
    if (gridIndex === -1) {
      return res.json([]);
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
        scanPos = nextClose + 6;
        if (depth === 0) {
          gridEndPos = scanPos;
          break;
        }
      }
    }
    
    if (gridEndPos === -1) {
      return res.json([]);
    }

    const gridContent = blogsHtml.substring(gridIndex + gridMarker.length, gridEndPos - 6);
    const cards = parseBlogCards(gridContent, siteId);
    
    const blogs = cards.map(c => ({
      filename: c.filename,
      title: c.title,
      dateStr: c.dateStr
    }));

    res.json(blogs);
  } catch (error) {
    console.error('Error fetching blogs list:', error);
    res.status(500).json({ error: 'Failed to fetch blogs list: ' + error.message });
  }
});

// API: Get details of a specific blog for editing
app.get('/api/blogs/:filename', authenticate, async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  const { filename } = req.params;

  try {
    const { siteId, config } = getSiteConfig(req);
    const { owner, repo, branch, token } = getGitCredentials(config);

    if (!token || !owner || !repo) {
      return res.status(500).json({ error: 'GitHub Integration is not configured for the active website.' });
    }

    const octokit = new Octokit({ auth: token });
    console.log(`Fetching blog content: ${filename} on ${config.displayName}...`);
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

    // Check if there is embedded metadata comment from our system
    let savedKeyword = null;
    let savedLandingUrl = null;
    const metaMatch = html.match(/<!--\s*SEO_METADATA:\s*({.*?})\s*-->/);
    if (metaMatch) {
      try {
        const meta = JSON.parse(metaMatch[1]);
        savedKeyword = meta.keyword;
        savedLandingUrl = meta.landing_url;
      } catch (err) {
        console.warn('Failed to parse SEO_METADATA comment:', err.message);
      }
    }

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
    const category = categoryMatch ? categoryMatch[1].replace(/<[^>]*>/g, '').trim() : config.categories[0].name;

    // 4. Extract Author, Date and Image path from grid card
    const gridPage = config.files.gridPage;
    let author = siteId === 'novox_core' ? 'Novoxed Tech LLP' : 'Novox Expert';
    let date = '';
    let imageFromBlogsHtml = '';

    try {
      const blogsRes = await octokit.repos.getContent({
        owner,
        repo,
        path: gridPage,
        ref: branch,
        headers: {
          'If-None-Match': '',
          'Cache-Control': 'no-cache'
        }
      });
      const blogsHtml = Buffer.from(blogsRes.data.content, 'base64').toString('utf8');
      const details = parseBlogCardForDetails(blogsHtml, filename, siteId);
      author = details.author;
      date = details.date;
      imageFromBlogsHtml = details.imageFromBlogsHtml;
    } catch (blogsErr) {
      console.warn(`Could not read details from ${gridPage}:`, blogsErr.message);
    }

    // Fallback to extraction from individual page spans if date not found in grid page
    if (!date) {
      if (siteId === 'novox_core') {
        const pageDateMatch = html.match(/<span\s+class=["']date has-left-line["'][^>]*>(.*?)<\/span>/i);
        if (pageDateMatch) date = pageDateMatch[1].replace(/<[^>]*>/g, '').trim();
      } else {
        const pageDateMatch = html.match(/<i\s+[^>]*class=["'](?:fa-light fa-)?calendar-days["'][^>]*><\/i>\s*([^<]+)/i) ||
                              html.match(/<span\s+class=["']modern-date["'][^>]*>(.*?)<\/span>/i);
        if (pageDateMatch) {
          date = pageDateMatch[1].replace(/<[^>]*>/g, '').trim();
        }
      }
    }

    if (!author || author === 'Novox Expert' || author === 'Novoxed Tech LLP') {
      if (siteId === 'novox_core') {
        const pageAuthorMatch = html.match(/<span\s+class=["']name["'][^>]*>By\s*<span>([\s\S]*?)<\/span>/i);
        if (pageAuthorMatch) author = pageAuthorMatch[1].replace(/<[^>]*>/g, '').trim();
      } else {
        const pageAuthorMatch = html.match(/<i\s+[^>]*class=["'](?:fa-light fa-)?user["'][^>]*><\/i>\s*(?:By\s+)?([^<]+)/i) ||
                                html.match(/<span\s+class=["']modern-date author-span["'][^>]*>(.*?)<\/span>/i);
        if (pageAuthorMatch) {
          author = pageAuthorMatch[1].replace(/<[^>]*>/g, '').replace(/By\s+/i, '').trim();
        }
      }
    }

    // 5. Extract Featured Image
    let image = imageFromBlogsHtml;
    if (!image) {
      let wrapperHtml = '';
      const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
      if (mainMatch) {
        wrapperHtml = mainMatch[1];
      } else {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) wrapperHtml = bodyMatch[1];
      }

      if (wrapperHtml) {
        const imgMatch = wrapperHtml.match(/<img\s+[^>]*class=["']blog-hero-img["'][^>]*src=["']([^"']+)["']/i) ||
                         wrapperHtml.match(/<img\s+[^>]*src=["']([^"']+)["']/i);
        if (imgMatch) {
          image = imgMatch[1].trim();
        }
      }
      
      if (!image) {
        image = config.files.defaultImage;
      }
    }

    // 6. Extract Content HTML
    const contentNormalized = html.replace(/\r\n/g, '\n');
    let content_html = '';

    if (siteId === 'novox_core') {
      const commentStart = contentNormalized.indexOf('<!-- BLOG_CONTENT_START -->');
      const commentEnd = contentNormalized.indexOf('<!-- BLOG_CONTENT_END -->');
      if (commentStart !== -1 && commentEnd !== -1 && commentEnd > commentStart) {
        content_html = contentNormalized.substring(commentStart + '<!-- BLOG_CONTENT_START -->'.length, commentEnd).trim();
      } else {
        // Find all occurrences of the container large div to filter out header/footer/title areas
        let occurrences = [];
        let pos = 0;
        while (true) {
          let idx = contentNormalized.indexOf('<div class="container large">', pos);
          if (idx === -1) {
            idx = contentNormalized.indexOf('<div class="container large"><br>', pos);
          }
          if (idx === -1) break;
          occurrences.push(idx);
          pos = idx + 1;
        }

        let containerIndex = -1;
        for (const idx of occurrences) {
          const chunk = contentNormalized.substring(idx, idx + 600);
          if (chunk.includes('header-area-2__inner') || chunk.includes('main-menu')) {
            continue;
          }
          if (chunk.includes('page-title-area-inner') || chunk.includes('page-title-wrapper') || chunk.includes('class="page-title')) {
            continue;
          }
          if (chunk.includes('footer-top-inner') || chunk.includes('class="footer-top-inner"')) {
            continue;
          }
          containerIndex = idx;
          break;
        }

        if (containerIndex !== -1) {
          let contentEndIndex = contentNormalized.indexOf('</main>', containerIndex);
          if (contentEndIndex === -1) {
            contentEndIndex = contentNormalized.indexOf('<footer', containerIndex);
          }
          if (contentEndIndex === -1) {
            contentEndIndex = contentNormalized.indexOf('<div class="footer-top-inner">', containerIndex);
          }

          if (contentEndIndex !== -1 && contentEndIndex > containerIndex) {
            let extracted = contentNormalized.substring(containerIndex, contentEndIndex).trim();
            extracted = extracted.replace(/^<div class="container large">\s*(?:<br\s*\/?>)?/i, '').trim();
            extracted = extracted.replace(/^<div class="container large"><br>/i, '').trim();
            extracted = extracted.replace(/^<img\s+[^>]*class=["']blog-hero-img["'][^>]*>\s*(?:<br\s*\/?>)?/i, '').trim();
            extracted = extracted.replace(/^<div\s+style=["\'][^"\']*text-align:\s*center[^"\']*["\'][^>]*>\s*<img\s+[^>]*>\s*<\/div>\s*(?:<br\s*\/?>)?/i, '').trim();
            extracted = extracted.replace(/^<h[2-5][^>]*>[\s\S]*?<\/h[2-5]>\s*(?:<br\s*\/?>)?/i, '').trim();
            
            if (extracted.endsWith('</div>')) {
              extracted = extracted.substring(0, extracted.length - 6).trim();
            }
            content_html = extracted;
          }
        }
      }
    } else {
      // EdTech
      const startKey = config.layout.contentStartKey || '<div class="blog-details-content">';
      const endKey = config.layout.contentEndKey;
      const startIndex = contentNormalized.indexOf(startKey);
      const endIndex = contentNormalized.indexOf(endKey, startIndex);

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
              extracted = extracted.replace(/<\/div>\s*<div\s+class=["']tp-postbox-details-text[^"']*["']>/gi, '\n');
              extracted = extracted.replace(/^<div\s+class=["']tp-postbox-details-text[^"']*["']>\s*/i, '');
              extracted = extracted.trim();
              if (extracted.endsWith('</div>')) {
                extracted = extracted.substring(0, extracted.length - 6).trim();
              }
              content_html = extracted;
            }
          }
        }
      }
    }

    // Clean title (strip title suffix at the end if present)
    const titleSuffix = config.titleSuffix || " | Novox Edtech";
    const cleanedTitle = title.replace(new RegExp(`\\s*\\|\\s*${titleSuffix.replace(/^[ |]*/, '')}\\s*$`, 'i'), '');

    // Extract landing page URL
    let landing_url = savedLandingUrl;
    if (!landing_url) {
      const categoriesList = config.categories.map(c => c.url);
      const escapedUrls = categoriesList.map(u => u.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')).join('|');
      const linkMatch = html.match(new RegExp(`<a\\s+[^>]*href=["']([^"']*(?:${escapedUrls}))["']`, 'i'));
      landing_url = linkMatch ? linkMatch[1] : config.defaultLandingUrl;
    }

    // Deduce target keyword using frequency and matching logic
    let keyword = savedKeyword;
    if (!keyword) {
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

      if (!keyword) {
        const words = cleanedTitle.split(/\s+/).filter(w => w.length > 0);
        keyword = words.slice(0, Math.min(3, words.length)).join(' ');
      }
    }

    const raw_image_url = `/api/blogs-image?path=${encodeURIComponent(image)}&siteId=${siteId}`;

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
  console.log(`Novox Unified Blog Admin server is running on http://localhost:${PORT}`);
});
