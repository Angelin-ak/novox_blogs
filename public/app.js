// -------------------------------------------------------------
// Novox Blog Verification Dashboard - Client Controller (ES6)
// -------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  let passcode = localStorage.getItem('novox_passcode') || '';
  
  // DOM Elements
  const dashboardApp = document.getElementById('dashboard-app');

  const generatorForm = document.getElementById('generator-form');
  const topicInput = document.getElementById('topic');
  const keywordsInput = document.getElementById('keywords');
  const primaryKeywordInput = document.getElementById('primary-keyword');
  const landingUrlInput = document.getElementById('landing-url');
  const categorySelect = document.getElementById('category');
  const authorInput = document.getElementById('author');
  const imageUrlInput = document.getElementById('image-url');
  const generateImageInput = document.getElementById('generate-image');
  const slugInput = document.getElementById('slug');

  let generatedImageBase64 = null;

  const generateBtn = document.getElementById('generate-btn');
  const btnText = document.getElementById('btn-text');
  const btnSpinner = document.getElementById('btn-spinner');

  const editorTitle = document.getElementById('editor-title');
  const editorDesc = document.getElementById('editor-desc');
  const editorContent = document.getElementById('editor-content');

  const tabButtons = document.querySelectorAll('.tab-btn');
  const paneContents = document.querySelectorAll('.pane-content');

  const previewBody = document.getElementById('preview-body');
  const browserUrl = document.getElementById('browser-url');
  const publishBtn = document.getElementById('publish-btn');

  // Console Elements
  const consoleOverlay = document.getElementById('console-overlay');
  const consoleOutput = document.getElementById('console-output');
  const consoleStatus = document.getElementById('console-status');
  const closeConsoleBtn = document.getElementById('close-console-btn');
  const liveCommitLink = document.getElementById('live-commit-link');

  // SEO Elements
  const scoreNum = document.getElementById('score-num');
  const scoreProgress = document.getElementById('score-progress');
  const checkTitle = document.getElementById('check-title');
  const checkDesc = document.getElementById('check-desc');
  const checkContent = document.getElementById('check-content');
  const checkKeywords = document.getElementById('check-keywords');
  const checkIntro = document.getElementById('check-intro');
  const checkHeadings = document.getElementById('check-headings');
  const checkFaq = document.getElementById('check-faq');
  const checkConclusion = document.getElementById('check-conclusion');
  const checkInternalLinks = document.getElementById('check-internal-links');
  const checkCta = document.getElementById('check-cta');
  const checkSlug = document.getElementById('check-slug');

  // Token usage display elements
  const tokenInput = document.getElementById('token-input');
  const tokenOutput = document.getElementById('token-output');
  const tokenTotal = document.getElementById('token-total');

  // -------------------------------------------------------------
  // Section 1: Authentication Handling (Disabled)
  // -------------------------------------------------------------
  
  const initAuth = () => {
    // Authentication is disabled - dashboard is accessible directly
  };

  // -------------------------------------------------------------
  // Section 2: AI Article Generation
  // -------------------------------------------------------------
  
  // Smart Auto-mapping helper based on text content
  const autoMapFields = (text) => {
    const lowerText = text.toLowerCase();
    let detectedUrl = 'mern-stack-course-detail.html'; // Default generic fallback
    let detectedCategory = 'Tech & Programming'; // Default generic fallback

    if (lowerText.includes('react') || lowerText.includes('next.js') || lowerText.includes('nextjs')) {
      detectedUrl = 'react-course-detail.html';
      detectedCategory = 'Web Development';
    } else if (lowerText.includes('mern') || lowerText.includes('mongodb') || lowerText.includes('node') || lowerText.includes('full stack') || lowerText.includes('fullstack') || lowerText.includes('web dev')) {
      detectedUrl = 'mern-stack-course-detail.html';
      detectedCategory = 'Web Development';
    } else if (lowerText.includes('python') || lowerText.includes('django') || lowerText.includes('data science')) {
      detectedUrl = 'python-development-course-detail.html';
      detectedCategory = 'Tech & Programming';
    } else if (lowerText.includes('flutter') || lowerText.includes('dart') || lowerText.includes('mobile app') || lowerText.includes('android') || lowerText.includes('ios') || lowerText.includes('app dev')) {
      detectedUrl = 'flutter-development-course-detail.html';
      detectedCategory = 'App Development';
    } else if (lowerText.includes('ai') || lowerText.includes('artificial intelligence') || lowerText.includes('machine learning') || lowerText.includes('generative') || lowerText.includes('llm') || lowerText.includes('deep learning')) {
      detectedUrl = 'ai-development-course-detail.html';
      detectedCategory = 'Artificial Intelligence';
    } else if (lowerText.includes('marketing') || lowerText.includes('seo') || lowerText.includes('social media') || lowerText.includes('advertis')) {
      detectedUrl = 'digital-marketing-course-detail.html';
      detectedCategory = 'Digital Marketing';
    } else if (lowerText.includes('ui') || lowerText.includes('ux') || lowerText.includes('figma') || lowerText.includes('user experience')) {
      detectedUrl = 'ui-ux-course-detail.html';
      detectedCategory = 'Design';
    } else if (lowerText.includes('design') || lowerText.includes('graphic') || lowerText.includes('photoshop') || lowerText.includes('illustrator')) {
      detectedUrl = 'graphic-design-course-detail.html';
      detectedCategory = 'Design';
    } else if (lowerText.includes('career') || lowerText.includes('placement') || lowerText.includes('job') || lowerText.includes('interview')) {
      detectedCategory = 'Career & Placement';
    } else if (lowerText.includes('student') || lowerText.includes('learn') || lowerText.includes('study') || lowerText.includes('college') || lowerText.includes('academic')) {
      detectedCategory = 'Student & Learning';
    }

    return { detectedUrl, detectedCategory };
  };

  // Auto-fill parameters as user writes topic (Smart Auto-mapping)
  topicInput.addEventListener('input', () => {
    if (!slugInput.value || slugInput.dataset.edited !== 'true') {
      slugInput.value = generateSlugString(topicInput.value);
    }

    const { detectedUrl, detectedCategory } = autoMapFields(topicInput.value);

    if (landingUrlInput.dataset.edited !== 'true' || !landingUrlInput.value || landingUrlInput.value === 'mern-stack-course-detail.html') {
      landingUrlInput.value = detectedUrl;
    }
    
    if (categorySelect.dataset.edited !== 'true') {
      categorySelect.value = detectedCategory;
    }

    if (!imageUrlInput.value || imageUrlInput.dataset.edited !== 'true' || imageUrlInput.value === 'assets/img/blog/new/generic_tech.png') {
      imageUrlInput.value = slugInput.value ? `assets/img/blog/new/${slugInput.value}.png` : '';
    }
  });

  slugInput.addEventListener('input', () => {
    slugInput.dataset.edited = 'true';
  });

  landingUrlInput.addEventListener('input', () => {
    landingUrlInput.dataset.edited = 'true';
  });

  imageUrlInput.addEventListener('input', () => {
    imageUrlInput.dataset.edited = 'true';
  });

  const categoryToCourseUrlMap = {
    'Web Development': 'mern-stack-course-detail.html',
    'Tech & Programming': 'python-development-course-detail.html',
    'App Development': 'flutter-development-course-detail.html',
    'Artificial Intelligence': 'ai-development-course-detail.html',
    'Digital Marketing': 'digital-marketing-course-detail.html',
    'Design': 'ui-ux-course-detail.html',
    'Career & Placement': 'mern-stack-course-detail.html',
    'Student & Learning': 'mern-stack-course-detail.html'
  };

  categorySelect.addEventListener('change', () => {
    categorySelect.dataset.edited = 'true';
    
    // Auto-update landing URL based on category if the user hasn't explicitly customized it
    if (landingUrlInput.dataset.edited !== 'true' || !landingUrlInput.value || landingUrlInput.value === 'mern-stack-course-detail.html') {
      const mappedUrl = categoryToCourseUrlMap[categorySelect.value];
      if (mappedUrl) {
        landingUrlInput.value = mappedUrl;
      }
    }
  });

  keywordsInput.addEventListener('input', () => {
    const kwText = keywordsInput.value.split(',')[0].trim();
    if (kwText && (!primaryKeywordInput.value || primaryKeywordInput.dataset.edited !== 'true')) {
      primaryKeywordInput.value = kwText;
      runSEOChecklist();
    }
  });

  primaryKeywordInput.addEventListener('input', () => {
    primaryKeywordInput.dataset.edited = 'true';
    runSEOChecklist();
  });

  const generateSlugString = (text) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/^-+|-+$/g, '');
  };

  generatorForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    // Toggle loading UI
    generateBtn.disabled = true;
    btnText.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating Content...';
    btnSpinner.classList.remove('hidden');

    const topic = topicInput.value.trim();
    const keywords = keywordsInput.value.split(',').map(k => k.trim()).filter(k => k.length > 0);
    const primary_keyword = primaryKeywordInput.value.trim();
    const landing_url = landingUrlInput.value.trim();
    const category = categorySelect.value;
    const author = authorInput.value.trim();

    const generate_image = generateImageInput.checked;

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${passcode}`
        },
        body: JSON.stringify({ topic, keywords, category, author, primary_keyword, landing_url, generate_image })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Server error occurred');
      }

      const data = await res.json();

      // Populate Editor Fields
      editorTitle.value = data.title;
      editorDesc.value = data.description;
      editorContent.value = data.content_html;
      
      // Auto-set slug
      slugInput.value = generateSlugString(data.title);

      // Auto-detect course URL and category based on the generated title
      const { detectedUrl, detectedCategory } = autoMapFields(data.title);
      if (landingUrlInput.dataset.edited !== 'true' || !landingUrlInput.value || landingUrlInput.value === 'mern-stack-course-detail.html') {
        landingUrlInput.value = detectedUrl;
      }
      if (categorySelect.dataset.edited !== 'true') {
        categorySelect.value = detectedCategory;
      }

      // Update token usage UI
      if (data.usage_metadata) {
        tokenInput.textContent = data.usage_metadata.promptTokenCount || 0;
        tokenOutput.textContent = data.usage_metadata.candidatesTokenCount || 0;
        tokenTotal.textContent = data.usage_metadata.totalTokenCount || 0;
      } else {
        tokenInput.textContent = '0';
        tokenOutput.textContent = '0';
        tokenTotal.textContent = '0';
      }

      // Handle AI image response
      if (data.image_base64) {
        generatedImageBase64 = data.image_base64;
      } else {
        generatedImageBase64 = null;
      }

      // Update Featured Image Path to match the generated slug name
      if (!imageUrlInput.value || imageUrlInput.dataset.edited !== 'true' || imageUrlInput.value === 'assets/img/blog/new/generic_tech.png') {
        imageUrlInput.value = `assets/img/blog/new/${slugInput.value}.png`;
      }

      // Switch to editor view
      switchTab('editor-tab');
      runSEOChecklist();

    } catch (error) {
      alert('Content Generation Failed: ' + error.message);
    } finally {
      generateBtn.disabled = false;
      btnText.innerHTML = '<i class="fa-solid fa-microchip"></i> Draft Article with AI';
      btnSpinner.classList.add('hidden');
    }
  });

  // -------------------------------------------------------------
  // Section 3: Tab switching and Web Simulator Rendering
  // -------------------------------------------------------------
  
  const switchTab = (tabId) => {
    tabButtons.forEach(btn => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    paneContents.forEach(pane => {
      if (pane.id === tabId) {
        pane.classList.add('active');
      } else {
        pane.classList.remove('active');
      }
    });

    if (tabId === 'preview-tab') {
      renderSimulatorPreview();
    }
  };

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  const renderSimulatorPreview = () => {
    const title = editorTitle.value || 'Draft Title';
    const content = editorContent.value || '<p>No content written yet.</p>';
    const category = categorySelect.value;
    const image = imageUrlInput.value;
    const slug = slugInput.value || 'untitled-post';

    browserUrl.textContent = `https://novoxedtechllp.com/${slug}.html`;

    const formattedDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const imgSrc = generatedImageBase64 ? `data:image/png;base64,${generatedImageBase64}` : `https://novoxedtechllp.com/${image}`;

    // Simulated Styled HTML structure matching the real site (with visual representation of headers, custom styles, spacing)
    previewBody.innerHTML = `
      <style>
        .sim-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid #efefef;
          padding-bottom: 12px;
          margin-bottom: 24px;
        }
        .sim-logo { font-size: 20px; font-weight: 800; color: #1e3a8a; }
        .sim-nav { display: flex; gap: 15px; font-size: 13px; color: #666; font-weight: 600; }
        
        .sim-breadcrumb {
          font-size: 12px;
          color: #888;
          margin-bottom: 12px;
        }
        .sim-breadcrumb a { color: #888; text-decoration: none; }
        .sim-title {
          font-size: 32px;
          font-weight: 800;
          color: #0f172a;
          line-height: 1.3;
          margin-bottom: 16px;
        }
        
        .sim-featured-img {
          width: 100%;
          height: 380px;
          object-fit: cover;
          border-radius: 12px;
          margin-bottom: 24px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }
        
        .sim-meta {
          display: flex;
          gap: 20px;
          font-size: 13px;
          color: #64748b;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .sim-meta i { color: #2563eb; margin-right: 6px; }
        
        .sim-content {
          font-size: 16px;
          line-height: 1.8;
          color: #334155;
        }
        .sim-content p { margin-bottom: 20px; }
        .sim-content h2 {
          font-size: 24px;
          font-weight: 700;
          color: #0f172a;
          margin-top: 32px;
          margin-bottom: 16px;
        }
        .sim-content h3 {
          font-size: 20px;
          font-weight: 600;
          color: #1e293b;
          margin-top: 24px;
          margin-bottom: 12px;
        }
        .sim-content ul {
          margin-left: 20px;
          margin-bottom: 20px;
        }
        .sim-content li { margin-bottom: 8px; }
        
        /* Company Style CTA Button styling */
        .tp-contact-btn {
          text-align: center;
          margin-top: 30px;
          margin-bottom: 30px;
        }
        .tp-btn-inner {
          display: inline-block;
          font-size: 16px;
          font-weight: 600;
          color: #ffffff !important;
          background-color: #2563eb;
          padding: 12px 28px;
          border-radius: 8px;
          text-decoration: none !important;
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
          transition: all 0.2s ease-in-out;
        }
        .tp-btn-inner:hover {
          background-color: #1d4ed8;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(37, 99, 235, 0.35);
        }
      </style>
      
      <div class="sim-header">
        <div class="sim-logo">NOVOX EDTECH</div>
        <div class="sim-nav">
          <span>Home</span>
          <span>About</span>
          <span>Courses</span>
          <span style="color: #2563eb; text-decoration: underline;">Blog</span>
        </div>
      </div>
      
      <div class="sim-breadcrumb">
        Home &nbsp;/&nbsp; Blog &nbsp;/&nbsp; <span style="color: #2563eb;">${category}</span>
      </div>
      
      <h1 class="sim-title">${title}</h1>
      
      <div class="sim-meta">
        <span><i class="fa-regular fa-calendar-days"></i> ${formattedDate}</span>
        <span><i class="fa-regular fa-user"></i> By ${authorInput.value}</span>
        <span><i class="fa-regular fa-tag"></i> ${category}</span>
      </div>
 
      <img src="${imgSrc}" alt="${title}" onerror="this.src='https://placehold.co/800x450/e2e8f0/64748b?text=Featured+Image'" class="sim-featured-img" />
      
      <div class="sim-content">
        ${content}
      </div>
    `;
  };

  // -------------------------------------------------------------
  // Section 4: Real-time SEO Validation
  // -------------------------------------------------------------

  const runSEOChecklist = () => {
    const title = editorTitle.value.trim();
    const desc = editorDesc.value.trim();
    const bodyHtml = editorContent.value.trim();
    const slug = slugInput.value.trim();
    const primaryKeyword = primaryKeywordInput.value.trim();
    const landingUrl = landingUrlInput.value.trim();

    let score = 0;
    let checksPassed = 0;

    // 1. Title length (40-65 chars) - Weight 10
    const titleLen = title.length;
    checkTitle.querySelector('.val').textContent = `${titleLen} chars`;
    if (titleLen >= 40 && titleLen <= 65) {
      updateCheckStatus(checkTitle, 'success');
      score += 10;
      checksPassed++;
    } else if (titleLen > 0) {
      updateCheckStatus(checkTitle, 'warning');
      score += 3;
    } else {
      updateCheckStatus(checkTitle, 'pending');
    }

    // 2. Meta description (110-165 chars) - Weight 10
    const descLen = desc.length;
    checkDesc.querySelector('.val').textContent = `${descLen} chars`;
    if (descLen >= 110 && descLen <= 165) {
      updateCheckStatus(checkDesc, 'success');
      score += 10;
      checksPassed++;
    } else if (descLen > 0) {
      updateCheckStatus(checkDesc, 'warning');
      score += 3;
    } else {
      updateCheckStatus(checkDesc, 'pending');
    }

    // 3. Word Count (Min 300 words) - Weight 10
    const plainText = bodyHtml.replace(/<[^>]*>/g, ' ');
    const wordCount = plainText.split(/\s+/).filter(w => w.length > 0).length;
    checkContent.querySelector('.val').textContent = `${wordCount} words`;
    if (wordCount >= 300) {
      updateCheckStatus(checkContent, 'success');
      score += 10;
      checksPassed++;
    } else if (wordCount > 0) {
      updateCheckStatus(checkContent, 'warning');
      score += 3;
    } else {
      updateCheckStatus(checkContent, 'pending');
    }

    // 4. Keyword Density (At least 3 matches) - Weight 10
    let kwMatchCount = 0;
    if (primaryKeyword) {
      const regex = new RegExp(primaryKeyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
      const matches = plainText.match(regex);
      if (matches) kwMatchCount = matches.length;
    }
    checkKeywords.querySelector('.val').textContent = `${kwMatchCount} matches`;
    if (kwMatchCount >= 3) {
      updateCheckStatus(checkKeywords, 'success');
      score += 10;
      checksPassed++;
    } else if (kwMatchCount > 0) {
      updateCheckStatus(checkKeywords, 'warning');
      score += 3;
    } else {
      updateCheckStatus(checkKeywords, 'pending');
    }

    // 5. Keyword in Intro - Weight 15
    let hasIntroKw = false;
    if (primaryKeyword && plainText) {
      const sentences = plainText.split('.').map(s => s.trim()).filter(s => s.length > 0);
      const introText = sentences.slice(0, 3).join(' ').toLowerCase();
      hasIntroKw = introText.includes(primaryKeyword.toLowerCase());
    }
    if (hasIntroKw) {
      updateCheckStatus(checkIntro, 'success');
      score += 15;
      checksPassed++;
    } else if (primaryKeyword && bodyHtml.length > 0) {
      updateCheckStatus(checkIntro, 'warning');
    } else {
      updateCheckStatus(checkIntro, 'pending');
    }

    // 6. Subheadings H2 (Min 2) - Weight 10
    const h2Matches = (bodyHtml.match(/<h2[^>]*>/gi) || []).length;
    checkHeadings.querySelector('.val').textContent = `${h2Matches} H2`;
    const hasH1 = /<h1[^>]*>/i.test(bodyHtml);
    if (h2Matches >= 2 && !hasH1) {
      updateCheckStatus(checkHeadings, 'success');
      score += 10;
      checksPassed++;
    } else if (h2Matches > 0 || hasH1) {
      updateCheckStatus(checkHeadings, 'warning');
    } else {
      updateCheckStatus(checkHeadings, 'pending');
    }

    // 7. FAQ Section - Weight 10
    const faqPatterns = [/faq/i, /frequently asked questions/i, /doubt/i, /common question/i];
    const hasFaq = faqPatterns.some(pat => pat.test(plainText)) && /<h3[^>]*>/i.test(bodyHtml);
    if (hasFaq) {
      updateCheckStatus(checkFaq, 'success');
      score += 10;
      checksPassed++;
    } else if (bodyHtml.length > 0) {
      updateCheckStatus(checkFaq, 'warning');
    } else {
      updateCheckStatus(checkFaq, 'pending');
    }

    // 8. Conclusion Section - Weight 10
    const conclusionPatterns = [/conclusion/i, /summary/i, /wrapping up/i, /final thoughts/i];
    const hasConclusion = conclusionPatterns.some(pat => pat.test(plainText));
    if (hasConclusion) {
      updateCheckStatus(checkConclusion, 'success');
      score += 10;
      checksPassed++;
    } else if (bodyHtml.length > 0) {
      updateCheckStatus(checkConclusion, 'warning');
    } else {
      updateCheckStatus(checkConclusion, 'pending');
    }

    // 9. Internal Course links - Weight 5
    const linkRegex = /<a\s+[^>]*href=["']([^"']+)["']/gi;
    let linkMatches;
    let hasInternalLink = false;
    while ((linkMatches = linkRegex.exec(bodyHtml)) !== null) {
      const href = linkMatches[1];
      if (href.includes('{{COURSE_URL}}') || (landingUrl && href.includes(landingUrl))) {
        hasInternalLink = true;
        break;
      }
    }
    if (hasInternalLink) {
      updateCheckStatus(checkInternalLinks, 'success');
      score += 5;
      checksPassed++;
    } else if (bodyHtml.length > 0) {
      updateCheckStatus(checkInternalLinks, 'warning');
    } else {
      updateCheckStatus(checkInternalLinks, 'pending');
    }

    // 10. Styled CTA Link - Weight 5
    const ctaPatterns = [/enroll/i, /contact/i, /register/i, /join/i, /start/i, /apply/i, /now/i, /us/i, /course/i, /program/i, /career/i];
    const ctaContainerRegex = /<div\s+[^>]*class=["'][^"']*tp-contact-btn[^"']*["'][^>]*>([\s\S]*?)<\/div>/gis;
    let ctaContainerMatch;
    let hasCta = false;
    while ((ctaContainerMatch = ctaContainerRegex.exec(bodyHtml)) !== null) {
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
    if (hasCta) {
      updateCheckStatus(checkCta, 'success');
      score += 5;
      checksPassed++;
    } else if (bodyHtml.length > 0) {
      updateCheckStatus(checkCta, 'warning');
    } else {
      updateCheckStatus(checkCta, 'pending');
    }

    // 11. Slug format - Weight 5
    const slugRegex = /^[a-z0-9-]+$/;
    if (slug.length > 0 && slugRegex.test(slug)) {
      updateCheckStatus(checkSlug, 'success');
      score += 5;
      checksPassed++;
    } else if (slug.length > 0) {
      updateCheckStatus(checkSlug, 'warning');
    } else {
      updateCheckStatus(checkSlug, 'pending');
    }

    // Update Circular Chart & Score Number
    scoreNum.textContent = score;
    const strokeDash = `${score}, 100`;
    scoreProgress.setAttribute('stroke-dasharray', strokeDash);

    // Dynamic coloring based on score
    if (score >= 90) {
      scoreProgress.style.stroke = 'var(--success-color)';
    } else if (score >= 60) {
      scoreProgress.style.stroke = 'var(--warning-color)';
    } else {
      scoreProgress.style.stroke = 'var(--danger-color)';
    }

    // Enable/Disable Publish Button (Enable if score >= 80)
    if (score >= 80) {
      publishBtn.disabled = false;
    } else {
      publishBtn.disabled = true;
    }
  };

  const updateCheckStatus = (el, status) => {
    el.className = status;
    const icon = el.querySelector('i');
    if (status === 'success') {
      icon.className = 'fa-solid fa-circle-check';
    } else if (status === 'warning') {
      icon.className = 'fa-solid fa-circle-exclamation';
    } else {
      icon.className = 'fa-solid fa-circle-question';
    }
  };

  // Add event listeners for real-time validation
  [editorTitle, editorDesc, editorContent, slugInput].forEach(el => {
    el.addEventListener('input', runSEOChecklist);
  });

  // -------------------------------------------------------------
  // Section 5: Verify & Publish (Git Commits via Backend)
  // -------------------------------------------------------------
  
  const writeLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const line = document.createElement('div');
    line.className = `log-line log-${type}`;
    line.innerHTML = `[${timestamp}] ${message}`;
    consoleOutput.appendChild(line);
    consoleOutput.scrollTop = consoleOutput.scrollHeight;
  };

  publishBtn.addEventListener('click', async () => {
    // Open Console Modal
    consoleOverlay.classList.add('active');
    consoleOutput.innerHTML = '';
    closeConsoleBtn.classList.add('hidden');
    liveCommitLink.classList.add('hidden');
    
    // Reset status
    consoleStatus.querySelector('.status-indicator').className = 'status-indicator processing';
    consoleStatus.querySelector('.status-msg').textContent = 'Authenticating transaction...';

    writeLog('Initializing blog publication client validation...', 'info');

    // Retrieve input values
    const title = editorTitle.value.trim();
    const description = editorDesc.value.trim();
    const content_html = editorContent.value.trim();
    const slug = slugInput.value.trim();
    const category = categorySelect.value;
    const author = authorInput.value.trim();
    const image = imageUrlInput.value.trim();
    const keyword = primaryKeywordInput.value.trim();
    const landing_url = landingUrlInput.value.trim();

    // Date in format: "May 10, 2026"
    const dateFormatted = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    });

    // 1. Run local client validation filter before sending to server
    writeLog('Running Format Verification & SEO checklist filters...', 'info');
    
    // a. Keyword in Intro Check
    const plainText = content_html.replace(/<[^>]*>/g, ' ');
    const sentences = plainText.split('.').map(s => s.trim()).filter(s => s.length > 0);
    const introText = sentences.slice(0, 3).join(' ').toLowerCase();
    const hasIntroKw = introText.includes(keyword.toLowerCase());
    
    if (!hasIntroKw) {
      writeLog(`VALIDATION ERROR: Primary keyword "${keyword}" is not present in the introduction text (first 3 sentences).`, 'error');
      consoleStatus.querySelector('.status-indicator').className = 'status-indicator failed';
      consoleStatus.querySelector('.status-msg').textContent = 'Verification Failed';
      closeConsoleBtn.classList.remove('hidden');
      return;
    }

    // b. Headings Aligned Check (no H1 in body, H2 >= 2)
    const hasH1 = /<h1[^>]*>/i.test(content_html);
    if (hasH1) {
      writeLog('VALIDATION ERROR: Semantic hierarchy mismatch. Do NOT include <h1> tags inside the content body.', 'error');
      consoleStatus.querySelector('.status-indicator').className = 'status-indicator failed';
      consoleStatus.querySelector('.status-msg').textContent = 'Verification Failed';
      closeConsoleBtn.classList.remove('hidden');
      return;
    }

    const h2Count = (content_html.match(/<h2[^>]*>/gi) || []).length;
    if (h2Count < 2) {
      writeLog(`VALIDATION ERROR: Semantic hierarchy mismatch. Must include at least two H2 subheadings. Found ${h2Count}.`, 'error');
      consoleStatus.querySelector('.status-indicator').className = 'status-indicator failed';
      consoleStatus.querySelector('.status-msg').textContent = 'Verification Failed';
      closeConsoleBtn.classList.remove('hidden');
      return;
    }

    writeLog('SEO checklist passed. Generating payload...', 'success');
    writeLog(`Title: "${title}"`, 'info');
    writeLog(`Slug: "${slug}.html"`, 'info');
    
    try {
      writeLog('Sending publishing transaction to GitHub API...', 'info');
      
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${passcode}`
        },
        body: JSON.stringify({
          title,
          description,
          category,
          author,
          date: dateFormatted,
          image,
          content_html,
          slug,
          landing_url,
          keyword,
          image_base64: generatedImageBase64
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Server publishing failed');
      }

      const data = await res.json();

      writeLog('API: Pulled blog-template-v2.html template successfully.', 'info');
      writeLog(`API: Compiled new static file: "${slug}.html".`, 'info');
      writeLog('API: Injected new listing card into blogs.html grid container.', 'info');
      writeLog('API: Appended URL to sitemap.xml.', 'info');
      writeLog('GitHub: Combined updates into single transactional tree.', 'success');
      writeLog(`GitHub: Created commit SHA ${data.commit_sha.substring(0, 7)}.`, 'success');
      writeLog('GitHub: Advanced heads/main branch reference successfully.', 'success');
      writeLog('Website publication committed successfully!', 'success');

      // Reset image state
      generatedImageBase64 = null;

      // Console UI Success state
      consoleStatus.querySelector('.status-indicator').className = 'status-indicator success';
      consoleStatus.querySelector('.status-msg').textContent = 'Pushed to GitHub Successfully!';
      
      // Setup live links
      liveCommitLink.href = data.commit_url;
      liveCommitLink.classList.remove('hidden');

      // Fire confetti celebration
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });

    } catch (error) {
      writeLog(`ERROR: ${error.message}`, 'error');
      consoleStatus.querySelector('.status-indicator').className = 'status-indicator failed';
      consoleStatus.querySelector('.status-msg').textContent = 'Publishing failed.';
    } finally {
      closeConsoleBtn.classList.remove('hidden');
    }
  });

  // Modal actions
  closeConsoleBtn.addEventListener('click', () => {
    consoleOverlay.classList.remove('active');
  });

  // Initialize Auth Check on Boot
  initAuth();
});
