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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const resultText = response.text;
    const parsedResult = JSON.parse(resultText);

    let imageBase64 = null;
    if (generate_image) {
      try {
        const imagePrompt = `A premium tech-concept digital illustration or 3D render representing '${parsedResult.title}'. Modern corporate style, vibrant blue and purple highlights, dark background, professional graphic design.`;
        const imageResponse = await ai.models.generateImages({
          model: 'imagen-4.0-generate-001',
          prompt: imagePrompt,
          config: {
            numberOfImages: 1,
            outputMimeType: 'image/png',
            aspectRatio: '16:9'
          }
        });
        if (imageResponse.generatedImages && imageResponse.generatedImages.length > 0) {
          imageBase64 = imageResponse.generatedImages[0].image.imageBytes;
        }
      } catch (imgErr) {
        console.warn('Image generation failed:', imgErr);
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
  const { title, description, category, author, date, image, content_html, slug, landing_url, keyword, image_base64 } = req.body;

  if (!title || !description || !category || !author || !date || !image || !content_html || !slug || !landing_url || !keyword) {
    return res.status(400).json({ error: 'Missing required publication parameters' });
  }

  // 1. Run structural and SEO validations (Format Verification filter)
  try {
    const plainText = content_html.replace(/<[^>]*>/g, ' ');

    // intro keyword check
    const sentences = plainText.split('.').map(s => s.trim()).filter(s => s.length > 0);
    const introText = sentences.slice(0, 3).join(' ').toLowerCase();
    if (!introText.includes(keyword.toLowerCase())) {
      return res.status(400).json({ error: `Validation Error: The target SEO keyword '${keyword}' must naturally exist in the introduction summary paragraph (first 3 sentences)!` });
    }

    // keyword density check
    const regex = new RegExp(keyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
    const kwMatches = plainText.match(regex) || [];
    if (kwMatches.length < 3) {
      return res.status(400).json({ error: `Validation Error: The targeted primary keyword '${keyword}' must appear at least 3 times in the text. Found ${kwMatches.length} times.` });
    }

    // no H1 check
    if (/<h1[^>]*>/i.test(content_html)) {
      return res.status(400).json({ error: "Validation Error: Semantic hierarchy mismatch. Do NOT include <h1> tags inside the content body." });
    }

    // H2 check
    const h2Matches = content_html.match(/<h2[^>]*>/gi) || [];
    if (h2Matches.length < 2) {
      return res.status(400).json({ error: `Validation Error: Semantic hierarchy mismatch. Must include at least two H2 subheadings. Found ${h2Matches.length}.` });
    }

    // FAQ check
    const faqPatterns = [/faq/i, /frequently asked questions/i, /doubt/i, /common question/i];
    const hasFaq = faqPatterns.some(pat => pat.test(plainText)) && /<h3[^>]*>/i.test(content_html);
    if (!hasFaq) {
      return res.status(400).json({ error: "Validation Error: Core structural mismatch. FAQ section is explicitly required before the end." });
    }

    // Conclusion check
    const conclusionPatterns = [/conclusion/i, /summary/i, /wrapping up/i, /final thoughts/i];
    const hasConclusion = conclusionPatterns.some(pat => pat.test(plainText));
    if (!hasConclusion) {
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
    if (!hasInternalLink) {
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
      return res.status(400).json({ error: "Validation Error: Core structural mismatch. Post must terminate with an explicit CTA action button wrapped in <div class=\"tp-contact-btn\"> containing an anchor <a class=\"tp-btn-inner\" href=\"contact.html\"> styled like the company's website (e.g. 'Contact Us Now')." });
    }

  } catch (err) {
    return res.status(400).json({ error: 'Validation Error: ' + err.message });
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

    // Compile new HTML
    const finalBodyHtml = content_html.replaceAll('{{COURSE_URL}}', landing_url);
    const compiledPage = templateHtml
      .replaceAll('{{TITLE}}', title)
      .replaceAll('{{DESCRIPTION}}', description)
      .replaceAll('{{CATEGORY}}', category)
      .replaceAll('{{IMAGE}}', image)
      .replaceAll('{{CONTENT}}', finalBodyHtml);

    const newFilename = `${slug}.html`;

    // Fetch blogs.html
    const blogsRes = await octokit.repos.getContent({ owner, repo, path: 'blogs.html', ref: branch });
    const blogsHtml = Buffer.from(blogsRes.data.content, 'base64').toString('utf8');

    const [categoryClass, badgeStyle] = getCategoryStyle(category);
    const cardHtml = `               <!-- Post: ${title} -->
               <div class="col-xl-4 col-lg-6 col-md-6 mb-40 grid-item ${categoryClass}">
                  <div class="tp-blog-item modern-card">
                     <div class="tp-blog-thumb fix">
                        <a href="${newFilename}"><img alt="${title}" loading="lazy" src="${image}" /></a>
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
               </div>\n`;

    const gridMarker = '<div class="row grid">';
    const gridIndex = blogsHtml.indexOf(gridMarker);
    if (gridIndex === -1) {
      throw new Error('Could not find blog grid container (<div class="row grid">) inside blogs.html');
    }
    const insertPosition = gridIndex + gridMarker.length;
    const updatedBlogsHtml = blogsHtml.substring(0, insertPosition) + '\n' + cardHtml + blogsHtml.substring(insertPosition);

    // Fetch sitemap.xml
    const sitemapRes = await octokit.repos.getContent({ owner, repo, path: 'sitemap.xml', ref: branch });
    const sitemapXml = Buffer.from(sitemapRes.data.content, 'base64').toString('utf8');

    const formattedDate = new Date().toISOString().split('T')[0];
    const sitemapEntry = `  <url>
    <loc>https://novoxedtechllp.com/${newFilename}</loc>
    <lastmod>${formattedDate}</lastmod>
    <priority>0.8</priority>
  </url>\n`;

    const urlsetMarker = '</urlset>';
    const urlsetIndex = sitemapXml.indexOf(urlsetMarker);
    if (urlsetIndex === -1) {
      throw new Error('Could not find </urlset> inside sitemap.xml');
    }
    const updatedSitemapXml = sitemapXml.substring(0, urlsetIndex) + sitemapEntry + sitemapXml.substring(urlsetIndex);

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

    if (image_base64) {
      const blobImage = await octokit.git.createBlob({
        owner,
        repo,
        content: image_base64,
        encoding: 'base64'
      });
      treeItems.push({
        path: `assets/img/blog/new/${slug}.png`,
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

// Run server
app.listen(PORT, () => {
  console.log(`Novox Blog Admin server is running on http://localhost:${PORT}`);
});
