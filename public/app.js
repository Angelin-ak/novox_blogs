// -------------------------------------------------------------
// Novox Blog Verification Dashboard - Client Controller (ES6)
// -------------------------------------------------------------

// Global Passcode Authentication Gate & Fetch Interceptor
const originalFetch = window.fetch;
window.fetch = async function(url, options = {}) {
  const currentPasscode = localStorage.getItem('novox_passcode') || '';
  if (currentPasscode) {
    options.headers = options.headers || {};
    options.headers['x-passcode'] = currentPasscode;
    options.headers['Authorization'] = `Bearer ${currentPasscode}`;
  }
  const response = await originalFetch(url, options);
  
  if (response.status === 401 && !url.includes('/api/verify-passcode')) {
    localStorage.removeItem('novox_passcode');
    showAuthGate();
  }
  return response;
};

function showAuthGate() {
  let overlay = document.getElementById('auth-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.className = 'overlay';
    overlay.innerHTML = `
      <div class="glass-card auth-card">
        <div class="auth-header">
          <div class="auth-icon"><i class="fa-solid fa-lock"></i></div>
          <h2>Passcode Required</h2>
          <p>Enter the master passcode to access the workspace</p>
        </div>
        <form id="auth-form" style="display: flex; flex-direction: column; gap: 15px;">
          <div class="input-group" style="text-align: left;">
            <label for="passcode-input">Master Passcode</label>
            <input type="password" id="passcode-input" placeholder="••••••••" required style="width: 100%;">
          </div>
          <button type="submit" class="btn btn-primary btn-block" style="width: 100%;">
            <span>Unlock Workspace</span>
          </button>
          <div id="auth-error" class="error-msg" style="display: none;"></div>
        </form>
      </div>
    `;
    document.body.appendChild(overlay);
    
    const form = overlay.querySelector('#auth-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = overlay.querySelector('#passcode-input');
      const errorDiv = overlay.querySelector('#auth-error');
      const submitBtn = form.querySelector('button[type="submit"]');
      const origBtnHtml = submitBtn.innerHTML;
      
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>Verifying...</span>';
      errorDiv.style.display = 'none';
      
      try {
        const res = await originalFetch('/api/verify-passcode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passcode: input.value })
        });
        
        if (res.ok) {
          localStorage.setItem('novox_passcode', input.value);
          overlay.classList.remove('active');
          window.location.reload();
        } else {
          errorDiv.textContent = 'Invalid passcode. Please try again.';
          errorDiv.style.display = 'block';
          input.value = '';
        }
      } catch (err) {
        errorDiv.textContent = 'Error contacting authentication server.';
        errorDiv.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = origBtnHtml;
      }
    });
  }
  overlay.classList.add('active');
}

document.addEventListener('DOMContentLoaded', async () => {
  let passcode = localStorage.getItem('novox_passcode') || '';
  if (!passcode) {
    showAuthGate();
    return;
  }
  
  // Identify Selected Site Profile
  const activeSiteId = localStorage.getItem('selectedSite') || 'novox_edtech';
  let activeSiteConfig = null;
  let allSitesConfig = {};

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
  const existingBlogsSelect = document.getElementById('existing-blogs-select');
  const loadBlogBtn = document.getElementById('load-blog-btn');
  const deleteBlogBtn = document.getElementById('delete-blog-btn');
  const publishDateInput = document.getElementById('publish-date');
  const imagePreviewThumbnailWrap = document.getElementById('image-preview-thumbnail-wrap');
  const sidebarImagePreview = document.getElementById('sidebar-image-preview');
  const regenerateImageBtn = document.getElementById('regenerate-image-btn');

  const siteHeaderIcon = document.getElementById('site-header-icon');
  const siteHeaderTitle = document.getElementById('site-header-title');

  let generatedImageBase64 = null;
  let loadedOriginalDate = null;
  let loadedOriginalFilename = null;

  // Date format conversion utilities
  const parseDateStringToYYYYMMDD = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  };

  const formatYYYYMMDDToDateString = (yyyyMMDD) => {
    if (!yyyyMMDD) return '';
    const parts = yyyyMMDD.split('-');
    if (parts.length !== 3) return '';
    const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    });
  };

  const getTodayDateString = () => {
    return new Date().toISOString().split('T')[0];
  };

  // Set default publish date to today on load
  if (publishDateInput) {
    publishDateInput.value = getTodayDateString();
  }

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

  // SEO Score Display
  const scoreNum = document.getElementById('score-num');
  const scoreProgress = document.getElementById('score-progress');

  // Token usage display elements
  const tokenInput = document.getElementById('token-input');
  const tokenOutput = document.getElementById('token-output');
  const tokenTotal = document.getElementById('token-total');

  // Fetch configs and initialize dynamic site styles, checklists, dropdowns
  try {
    const configRes = await fetch(`/api/config?_t=${Date.now()}`);
    if (!configRes.ok) throw new Error('Failed to fetch sites configuration');
    allSitesConfig = await configRes.json();
    activeSiteConfig = allSitesConfig[activeSiteId];
    if (!activeSiteConfig) {
      alert(`Site profile ${activeSiteId} not found in config!`);
      activeSiteConfig = allSitesConfig[Object.keys(allSitesConfig)[0]];
    }
  } catch (err) {
    console.error('Failed to load multi-site setup, using fallback settings.', err);
    // Fallback stub config
    activeSiteConfig = {
      displayName: "Novox Edtech",
      niche: "IT & Software Training Institute",
      domain: "https://novoxedtechllp.com",
      icon: "fa-solid fa-graduation-cap",
      defaultLandingUrl: "mern-stack-course-detail.html",
      files: {
        gridPage: "blogs.html",
        template: "blog-template-v2.html",
        sitemap: "sitemap.xml",
        defaultImage: "assets/img/blog/blogimages/technologytrendblog.jpg"
      },
      categories: [
        {"name": "Web Development", "url": "mern-stack-course-detail.html"},
        {"name": "Tech & Programming", "url": "python-development-course-detail.html"}
      ],
      seo: {
        requireFaq: true,
        requireConclusion: true,
        headingTag: "h2",
        subheadingTag: "h3",
        ctaHtml: "<div class=\"tp-contact-btn text-center mt-30\"><a class=\"tp-btn-inner\" href=\"contact.html\">Contact Us Now</a></div>",
        ctaClass: "tp-contact-btn",
        ctaAnchorClass: "tp-btn-inner",
        ctaTextPattern: ["enroll", "contact", "register", "join", "start"]
      },
      theme: {
        background: "#0f0f15",
        primaryColor: "#3b82f6",
        glowColor: "rgba(59, 130, 246, 0.15)",
        accentColor: "#60a5fa"
      }
    };
  }

  // Apply Brand Headers and Titles
  if (siteHeaderIcon) {
    siteHeaderIcon.className = activeSiteConfig.icon;
  }
  if (siteHeaderTitle) {
    siteHeaderTitle.textContent = activeSiteConfig.displayName;
  }
  document.title = `${activeSiteConfig.displayName} | Blog Verification Dashboard`;

  // Inject Theme Styling Override dynamically
  const styleEl = document.createElement('style');
  styleEl.innerHTML = `
    :root {
      --primary-color: ${activeSiteConfig.theme.primaryColor};
      --primary-glow: ${activeSiteConfig.theme.glowColor};
      --secondary-color: ${activeSiteConfig.theme.accentColor};
    }
  `;
  document.head.appendChild(styleEl);

  // Set default Author and Landing URL on parameters
  if (authorInput) {
    authorInput.value = activeSiteId === 'novox_core' ? 'novox expert' : 'Novox Expert';
  }
  if (landingUrlInput) {
    landingUrlInput.value = activeSiteConfig.defaultLandingUrl;
    landingUrlInput.placeholder = `e.g. ${activeSiteConfig.defaultLandingUrl}`;
  }
  if (imageUrlInput) {
    imageUrlInput.placeholder = `e.g. ${activeSiteConfig.files.defaultImage}`;
  }

  // Populate Categories Select Dropdown
  if (categorySelect) {
    categorySelect.innerHTML = '';
    activeSiteConfig.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.name;
      opt.textContent = cat.name;
      categorySelect.appendChild(opt);
    });
  }

  // Initialize SEO Checklist UI Items dynamically based on site profiles
  const initChecklist = () => {
    const checklistItems = document.getElementById('checklist-items');
    if (!checklistItems) return;
    
    let html = `
      <li id="check-title" class="pending"><i class="fa-solid fa-circle-question"></i> Title (50-60 chars) <span class="val">0/60</span></li>
      <li id="check-desc" class="pending"><i class="fa-solid fa-circle-question"></i> Meta Desc (120-160 chars) <span class="val">0/160</span></li>
      <li id="check-content" class="pending"><i class="fa-solid fa-circle-question"></i> Length (Min 300 words) <span class="val">0</span></li>
      <li id="check-keywords" class="pending"><i class="fa-solid fa-circle-question"></i> Keywords count (Min 3 times) <span class="val">0</span></li>
      <li id="check-intro" class="pending"><i class="fa-solid fa-circle-question"></i> Keyword in Intro (First 3 sentences)</li>
      <li id="check-headings" class="pending"><i class="fa-solid fa-circle-question"></i> Subheadings ${activeSiteConfig.seo.headingTag.toUpperCase()} (Min 2) <span class="val">0</span></li>
    `;

    if (activeSiteConfig.seo.requireFaq) {
      html += `<li id="check-faq" class="pending"><i class="fa-solid fa-circle-question"></i> FAQ Section present</li>`;
    }

    if (activeSiteConfig.seo.requireConclusion) {
      html += `<li id="check-conclusion" class="pending"><i class="fa-solid fa-circle-question"></i> Conclusion Section present</li>`;
    }

    html += `
      <li id="check-internal-links" class="pending"><i class="fa-solid fa-circle-question"></i> Link to Landing Page</li>
      <li id="check-cta" class="pending"><i class="fa-solid fa-circle-question"></i> Styled CTA button (.${activeSiteConfig.seo.ctaAnchorClass})</li>
      <li id="check-slug" class="pending"><i class="fa-solid fa-circle-question"></i> Slug format (kebab-case)</li>
    `;

    checklistItems.innerHTML = html;

    // Bind references to global variables so they are easily accessible in runSEOChecklist
    window.checkTitle = document.getElementById('check-title');
    window.checkDesc = document.getElementById('check-desc');
    window.checkContent = document.getElementById('check-content');
    window.checkKeywords = document.getElementById('check-keywords');
    window.checkIntro = document.getElementById('check-intro');
    window.checkHeadings = document.getElementById('check-headings');
    window.checkFaq = document.getElementById('check-faq');
    window.checkConclusion = document.getElementById('check-conclusion');
    window.checkInternalLinks = document.getElementById('check-internal-links');
    window.checkCta = document.getElementById('check-cta');
    window.checkSlug = document.getElementById('check-slug');
  };

  initChecklist();

  // Smart Auto-mapping helper based on text content
  const autoMapFields = (text) => {
    const lowerText = text.toLowerCase();
    let detectedUrl = activeSiteConfig.defaultLandingUrl;
    let detectedCategory = activeSiteConfig.categories[0].name;

    for (const cat of activeSiteConfig.categories) {
      // Check if title words match the category name partially
      const catFirstWord = cat.name.toLowerCase().split(' ')[0];
      if (lowerText.includes(catFirstWord) && catFirstWord.length > 2) {
        detectedUrl = cat.url;
        detectedCategory = cat.name;
        break;
      }
    }
    return { detectedUrl, detectedCategory };
  };

  // Auto-fill parameters as user writes topic
  topicInput.addEventListener('input', () => {
    if (loadedOriginalFilename) return;
    if (!slugInput.value || slugInput.dataset.edited !== 'true') {
      slugInput.value = generateSlugString(topicInput.value);
    }

    const { detectedUrl, detectedCategory } = autoMapFields(topicInput.value);

    if (landingUrlInput.dataset.edited !== 'true' || !landingUrlInput.value || landingUrlInput.value === activeSiteConfig.defaultLandingUrl) {
      landingUrlInput.value = detectedUrl;
    }
    
    if (categorySelect.dataset.edited !== 'true') {
      categorySelect.value = detectedCategory;
    }

    if (!imageUrlInput.value || imageUrlInput.dataset.edited !== 'true') {
      // E.g., assets/img/blog/new/topic.png vs Images/topic.png or asset names
      const defaultImgPath = activeSiteConfig.files.defaultImage;
      const baseDir = defaultImgPath.substring(0, defaultImgPath.lastIndexOf('/') + 1);
      imageUrlInput.value = slugInput.value ? `${baseDir}${slugInput.value}.png` : '';
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

  categorySelect.addEventListener('change', () => {
    categorySelect.dataset.edited = 'true';
    
    // Auto-update landing URL based on category selection mapping if not edited manually
    if (landingUrlInput.dataset.edited !== 'true' || !landingUrlInput.value || landingUrlInput.value === activeSiteConfig.defaultLandingUrl) {
      const match = activeSiteConfig.categories.find(c => c.name === categorySelect.value);
      if (match) {
        landingUrlInput.value = match.url;
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
          'Authorization': `Bearer ${passcode}`,
          'x-site-id': activeSiteId
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
      
      if (!loadedOriginalFilename) {
        slugInput.value = generateSlugString(data.title);
      }

      // Auto-detect mappings from Title
      const { detectedUrl, detectedCategory } = autoMapFields(data.title);
      if (landingUrlInput.dataset.edited !== 'true' || !landingUrlInput.value || landingUrlInput.value === activeSiteConfig.defaultLandingUrl) {
        landingUrlInput.value = detectedUrl;
      }
      if (categorySelect.dataset.edited !== 'true') {
        categorySelect.value = detectedCategory;
      }

      // Update Token Usage Display
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
        const isJpeg = generatedImageBase64.startsWith('/9j/');
        const mimeType = isJpeg ? 'image/jpeg' : 'image/png';
        
        sidebarImagePreview.src = `data:${mimeType};base64,${generatedImageBase64}`;
        imagePreviewThumbnailWrap.style.display = 'block';
        regenerateImageBtn.style.display = 'block';
      } else {
        generatedImageBase64 = null;
        imagePreviewThumbnailWrap.style.display = 'none';
        regenerateImageBtn.style.display = 'none';
      }

      // Update Featured Image Path
      if (!loadedOriginalFilename) {
        if (!imageUrlInput.value || imageUrlInput.dataset.edited !== 'true') {
          const defaultImgPath = activeSiteConfig.files.defaultImage;
          const baseDir = defaultImgPath.substring(0, defaultImgPath.lastIndexOf('/') + 1);
          imageUrlInput.value = `${baseDir}${slugInput.value}.png`;
        }
      }

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

  const populateExistingBlogsDropdown = async () => {
    if (!existingBlogsSelect) return;
    try {
      const res = await fetch(`/api/blogs?siteId=${activeSiteId}&_t=${Date.now()}`, {
        headers: { 'x-site-id': activeSiteId }
      });
      if (!res.ok) throw new Error('Failed to fetch existing blogs');
      const blogs = await res.json();
      
      existingBlogsSelect.innerHTML = '<option value="">-- Create New Post --</option>';
      
      blogs.forEach(blog => {
        const option = document.createElement('option');
        option.value = blog.filename;
        option.textContent = blog.title || slugToTitle(blog.filename);
        existingBlogsSelect.appendChild(option);
      });
    } catch (err) {
      console.error('Error populating existing blogs dropdown:', err);
    }
  };

  const slugToTitle = (slug) => {
    return slug
      .replace('.html', '')
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  loadBlogBtn.addEventListener('click', async () => {
    const filename = existingBlogsSelect.value;
    if (!filename) {
      alert('Please select an existing blog post to load.');
      return;
    }

    loadBlogBtn.disabled = true;
    const originalText = loadBlogBtn.innerHTML;
    loadBlogBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';

    try {
      const res = await fetch(`/api/blogs/${encodeURIComponent(filename)}?siteId=${activeSiteId}&_t=${Date.now()}`, {
        headers: { 'x-site-id': activeSiteId }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch blog details');
      }

      const data = await res.json();

      // Populate Parameters Panel
      topicInput.value = data.title;
      slugInput.value = data.slug;
      slugInput.disabled = true; 

      let hasCategoryOption = false;
      for (let i = 0; i < categorySelect.options.length; i++) {
        if (categorySelect.options[i].value === data.category) {
          hasCategoryOption = true;
          break;
        }
      }
      if (!hasCategoryOption && data.category) {
        const opt = document.createElement('option');
        opt.value = data.category;
        opt.textContent = data.category;
        categorySelect.appendChild(opt);
      }
      categorySelect.value = data.category;
      landingUrlInput.value = data.landing_url;
      imageUrlInput.value = data.image;
      authorInput.value = data.author;
      primaryKeywordInput.value = data.keyword || '';
      keywordsInput.value = data.keyword || '';
      publishDateInput.value = parseDateStringToYYYYMMDD(data.date) || getTodayDateString();

      // Set flags to prevent automatic overwrite by keyups
      slugInput.dataset.edited = 'true';
      landingUrlInput.dataset.edited = 'true';
      imageUrlInput.dataset.edited = 'true';
      categorySelect.dataset.edited = 'true';
      primaryKeywordInput.dataset.edited = 'true';
      publishDateInput.dataset.edited = 'true';

      // Populate Editor Fields
      editorTitle.value = data.title;
      editorDesc.value = data.description;
      editorContent.value = data.content_html;

      switchTab('editor-tab');
      runSEOChecklist();

      generatedImageBase64 = null;
      loadedOriginalFilename = filename;
      loadedOriginalDate = data.date || null;

      // Populate image thumbnail preview from GitHub raw proxy
      if (data.raw_image_url) {
        sidebarImagePreview.src = data.raw_image_url;
        imagePreviewThumbnailWrap.style.display = 'block';
        regenerateImageBtn.style.display = 'block';
      } else {
        imagePreviewThumbnailWrap.style.display = 'none';
        regenerateImageBtn.style.display = 'none';
      }
      
      if (deleteBlogBtn) deleteBlogBtn.style.display = 'block';
    } catch (err) {
      alert('Failed to load blog: ' + err.message);
    } finally {
      loadBlogBtn.disabled = false;
      loadBlogBtn.innerHTML = originalText;
    }
  });

  existingBlogsSelect.addEventListener('change', () => {
    if (!existingBlogsSelect.value) {
      // Reset back to Create mode
      loadedOriginalDate = null;
      loadedOriginalFilename = null;
      generatorForm.reset();
      if (authorInput) {
        authorInput.value = activeSiteId === 'novox_core' ? 'novox expert' : 'Novox Expert';
      }
      if (landingUrlInput) {
        landingUrlInput.value = activeSiteConfig.defaultLandingUrl;
      }
      slugInput.disabled = false;
      slugInput.dataset.edited = 'false';
      landingUrlInput.dataset.edited = 'false';
      imageUrlInput.dataset.edited = 'false';
      categorySelect.dataset.edited = 'false';
      primaryKeywordInput.dataset.edited = 'false';
      publishDateInput.dataset.edited = 'false';
      publishDateInput.value = getTodayDateString();
      imagePreviewThumbnailWrap.style.display = 'none';
      regenerateImageBtn.style.display = 'none';
      if (deleteBlogBtn) deleteBlogBtn.style.display = 'none';
      sidebarImagePreview.src = '';
      editorTitle.value = '';
      editorDesc.value = '';
      editorContent.value = '';
      runSEOChecklist();
    }
  });

  if (deleteBlogBtn) {
    deleteBlogBtn.addEventListener('click', async () => {
      const filename = existingBlogsSelect.value;
      if (!filename) return;

      const confirmDelete = confirm(`Are you sure you want to permanently delete the blog post "${filename}"?\n\nThis will remove the HTML file, its sitemap entry, and delete its card card from the grid of ${activeSiteConfig.displayName} on GitHub.`);
      if (!confirmDelete) return;

      consoleOverlay.classList.add('active');
      consoleOutput.innerHTML = '';
      closeConsoleBtn.classList.add('hidden');
      liveCommitLink.classList.add('hidden');
      
      consoleStatus.querySelector('.status-indicator').className = 'status-indicator processing';
      consoleStatus.querySelector('.status-msg').textContent = 'Authenticating deletion transaction...';

      writeLog(`Initializing deletion on ${activeSiteConfig.displayName} for blog: "${filename}"...`, 'info');

      try {
        writeLog('Sending deletion transaction to GitHub API...', 'info');
        const res = await fetch(`/api/blogs/${encodeURIComponent(filename)}/delete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${passcode}`,
            'x-site-id': activeSiteId
          }
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Server deletion failed');
        }

        const data = await res.json();

        writeLog(`API: Filtered card "${filename}" from grid container successfully.`, 'info');
        writeLog(`API: Cleaned sitemap.xml location entry.`, 'info');
        writeLog(`API: Added deletion command for path "${filename}" to Git Data transaction.`, 'info');
        writeLog('GitHub: Combined updates into single transactional tree.', 'success');
        writeLog(`GitHub: Created delete commit SHA ${data.commit_sha.substring(0, 7)}.`, 'success');
        writeLog(`GitHub: Advanced heads/${activeSiteConfig.git.branchEnvVar ? 'main' : 'branch'} reference successfully.`, 'success');
        writeLog('Blog post deleted successfully from GitHub!', 'success');

        loadedOriginalDate = null;
        loadedOriginalFilename = null;
        generatorForm.reset();
        if (authorInput) {
          authorInput.value = activeSiteId === 'novox_core' ? 'novox expert' : 'Novox Expert';
        }
        if (landingUrlInput) {
          landingUrlInput.value = activeSiteConfig.defaultLandingUrl;
        }
        slugInput.dataset.edited = 'false';
        landingUrlInput.dataset.edited = 'false';
        imageUrlInput.dataset.edited = 'false';
        categorySelect.dataset.edited = 'false';
        primaryKeywordInput.dataset.edited = 'false';
        publishDateInput.dataset.edited = 'false';
        publishDateInput.value = getTodayDateString();
        imagePreviewThumbnailWrap.style.display = 'none';
        regenerateImageBtn.style.display = 'none';
        deleteBlogBtn.style.display = 'none';
        sidebarImagePreview.src = '';
        editorTitle.value = '';
        editorDesc.value = '';
        editorContent.value = '';
        
        await populateExistingBlogsDropdown();
        runSEOChecklist();

        consoleStatus.querySelector('.status-indicator').className = 'status-indicator success';
        consoleStatus.querySelector('.status-msg').textContent = 'Blog Deleted Successfully!';
        
        liveCommitLink.href = data.commit_url;
        liveCommitLink.classList.remove('hidden');

      } catch (err) {
        writeLog(`ERROR: ${err.message}`, 'error');
        consoleStatus.querySelector('.status-indicator').className = 'status-indicator failed';
        consoleStatus.querySelector('.status-msg').textContent = 'Deletion failed.';
      } finally {
        closeConsoleBtn.classList.remove('hidden');
      }
    });
  }

  regenerateImageBtn.addEventListener('click', async () => {
    const title = editorTitle.value.trim() || topicInput.value.trim();
    if (!title) {
      alert('Please load a blog first or enter a title to use as the image prompt.');
      return;
    }

    regenerateImageBtn.disabled = true;
    const originalBtnText = regenerateImageBtn.innerHTML;
    regenerateImageBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';

    try {
      const res = await fetch('/api/generate-image-only', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${passcode}`
        },
        body: JSON.stringify({ title })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Server image generation failed');
      }

      const data = await res.json();
      if (data.image_base64) {
        generatedImageBase64 = data.image_base64;
        const isJpeg = generatedImageBase64.startsWith('/9j/');
        const mimeType = isJpeg ? 'image/jpeg' : 'image/png';
        
        sidebarImagePreview.src = `data:${mimeType};base64,${generatedImageBase64}`;
        imagePreviewThumbnailWrap.style.display = 'block';
        
        updatePreviewIfActive();
        alert('AI Featured Image regenerated successfully! It will be committed when you publish.');
      }
    } catch (err) {
      alert('Failed to generate image: ' + err.message);
    } finally {
      regenerateImageBtn.disabled = false;
      regenerateImageBtn.innerHTML = originalBtnText;
    }
  });

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

    const isCore = activeSiteId === 'novox_core';
    const isDarkTheme = activeSiteConfig.theme.background !== '#ffffff';
    previewBody.style.background = isCore ? '#000000' : '#ffffff';
    previewBody.style.padding = '0';

    browserUrl.textContent = `${activeSiteConfig.domain}/${slug}.html`;

    const selectedDate = publishDateInput.value;
    let formattedDate = '';
    if (selectedDate) {
      const parts = selectedDate.split('-');
      if (parts.length === 3) {
        const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        formattedDate = d.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
    }
    if (!formattedDate) {
      formattedDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }

    const isJpeg = generatedImageBase64 && generatedImageBase64.startsWith('/9j/');
    const mimeType = isJpeg ? 'image/jpeg' : 'image/png';
    
    let imgSrc = '';
    if (generatedImageBase64) {
      imgSrc = `data:${mimeType};base64,${generatedImageBase64}`;
    } else if (image && (image.startsWith('assets/') || image.startsWith('Images/') || (!image.startsWith('http') && !image.startsWith('data:')))) {
      imgSrc = `/api/blogs-image?path=${encodeURIComponent(image)}&siteId=${activeSiteId}`;
    } else {
      imgSrc = image || 'https://placehold.co/800x450/e2e8f0/64748b?text=Featured+Image';
    }

    // Render themed mock site frame wrapper
    previewBody.innerHTML = `
      <style>
        .sim-wrapper {
          background-color: ${activeSiteConfig.theme.background || '#ffffff'};
          color: ${isDarkTheme ? '#cbd5e1' : '#334155'};
          font-family: 'Inter', system-ui, -apple-system, sans-serif;
          padding: 24px;
          min-height: 100%;
        }
        .sim-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 2px solid ${isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'};
          padding-bottom: 12px;
          margin-bottom: 24px;
        }
        .sim-logo { font-size: 20px; font-weight: 800; color: ${activeSiteConfig.theme.primaryColor}; }
        .sim-nav { display: flex; gap: 15px; font-size: 13px; color: ${isDarkTheme ? '#94a3b8' : '#64748b'}; font-weight: 600; }
        
        .sim-breadcrumb {
          font-size: 12px;
          color: #64748b;
          margin-bottom: 12px;
        }
        .sim-breadcrumb span { color: ${activeSiteConfig.theme.primaryColor}; }
        .sim-title {
          font-size: 32px;
          font-weight: 800;
          color: ${isDarkTheme ? '#ffffff' : '#0f172a'};
          line-height: 1.3;
          margin-bottom: 16px;
        }
        
        .sim-featured-img {
          width: 100%;
          height: 380px;
          object-fit: cover;
          border-radius: 12px;
          margin-bottom: 24px;
          box-shadow: ${isDarkTheme ? '0 4px 20px rgba(0,0,0, 0.5)' : '0 4px 20px rgba(0,0,0, 0.08)'};
        }
        
        .sim-meta {
          display: flex;
          gap: 20px;
          font-size: 13px;
          color: ${isDarkTheme ? '#94a3b8' : '#64748b'};
          border-bottom: 1px solid ${isDarkTheme ? 'rgba(255, 255, 255, 0.08)' : '#e2e8f0'};
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .sim-meta i { color: ${activeSiteConfig.theme.primaryColor}; margin-right: 6px; }
        
        .sim-content {
          font-size: 16px;
          line-height: 1.8;
          color: ${isDarkTheme ? '#cbd5e1' : '#334155'};
        }
        .sim-content p { margin-bottom: 20px; }
        .sim-content h2, .sim-content h4 {
          font-size: 24px;
          font-weight: 700;
          color: ${isDarkTheme ? '#ffffff' : '#0f172a'};
          margin-top: 32px;
          margin-bottom: 16px;
        }
        .sim-content h3, .sim-content h5 {
          font-size: 20px;
          font-weight: 600;
          color: ${isDarkTheme ? '#f1f5f9' : '#1e293b'};
          margin-top: 24px;
          margin-bottom: 12px;
        }
        .sim-content ul {
          margin-left: 20px;
          margin-bottom: 20px;
        }
        .sim-content li { margin-bottom: 8px; }
        
        ${isCore ? `
        .sim-content ul {
          list-style: none;
          padding-left: 0;
        }
        .sim-content li {
          position: relative;
          padding-left: 15px;
          margin-bottom: 8px;
        }
        .sim-content li::before {
          content: "•";
          color: ${activeSiteConfig.theme.primaryColor};
          font-weight: bold;
          display: inline-block; 
          width: 1em;
          margin-left: -1em;
        }
        ` : ''}

        /* Company Styled CTA Button styling */
        .tp-contact-btn, .cta-btn-wrapper {
          text-align: center;
          margin-top: 30px;
          margin-bottom: 30px;
        }
        .tp-btn-inner, .rr-btn {
          display: inline-block;
          font-size: 16px;
          font-weight: 600;
          color: #ffffff !important;
          background-color: ${activeSiteConfig.theme.primaryColor};
          padding: 12px 28px;
          border-radius: 8px;
          text-decoration: none !important;
          box-shadow: 0 4px 12px ${activeSiteConfig.theme.glowColor};
          transition: all 0.2s ease-in-out;
        }
        .tp-btn-inner:hover, .rr-btn:hover {
          background-color: ${activeSiteConfig.theme.accentColor};
          transform: translateY(-2px);
          box-shadow: 0 6px 16px ${activeSiteConfig.theme.glowColor};
        }
      </style>
      
      <div class="sim-wrapper">
        <div class="sim-header">
          <div class="sim-logo">${isCore ? 'NOVOX CORE' : 'NOVOX EDTECH'}</div>
          <div class="sim-nav">
            <span>Home</span>
            <span>About</span>
            <span>${isCore ? 'Services' : 'Courses'}</span>
            <span style="color: ${isCore ? '#10b981' : '#2563eb'}; text-decoration: underline;">Blog</span>
          </div>
        </div>
        
        <div class="sim-breadcrumb">
          Home &nbsp;/&nbsp; Blog &nbsp;/&nbsp; <span>${category}</span>
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
      </div>
    `;
  };

  // Real-time SEO Validation checklist matching active site configurations
  const runSEOChecklist = () => {
    const title = editorTitle.value.trim();
    const desc = editorDesc.value.trim();
    const bodyHtml = editorContent.value.trim();
    const slug = slugInput.value.trim();
    const primaryKeyword = primaryKeywordInput.value.trim();
    const landingUrl = landingUrlInput.value.trim();

    let score = 0;
    let checksPassed = 0;
    
    // Total checklist weight = 100 points
    // Let's divide weight depending on checks present
    const baseChecks = 9;
    const requireFaq = activeSiteConfig.seo.requireFaq;
    const requireConclusion = activeSiteConfig.seo.requireConclusion;
    
    let wTitle = 10;
    let wDesc = 10;
    let wContent = 10;
    let wKeywords = 10;
    let wIntro = 15;
    let wHeadings = 10;
    let wInternal = 10;
    let wCta = 10;
    let wSlug = 5;
    
    let wFaq = requireFaq ? 5 : 0;
    let wConclusion = requireConclusion ? (requireFaq ? 5 : 10) : 0;

    // 1. Title length (40-65 chars)
    const titleLen = title.length;
    if (window.checkTitle) {
      window.checkTitle.querySelector('.val').textContent = `${titleLen} chars`;
      if (titleLen >= 40 && titleLen <= 65) {
        updateCheckStatus(window.checkTitle, 'success');
        score += wTitle;
        checksPassed++;
      } else if (titleLen > 0) {
        updateCheckStatus(window.checkTitle, 'warning');
        score += Math.round(wTitle * 0.3);
      } else {
        updateCheckStatus(window.checkTitle, 'pending');
      }
    }

    // 2. Meta description (110-165 chars)
    const descLen = desc.length;
    if (window.checkDesc) {
      window.checkDesc.querySelector('.val').textContent = `${descLen} chars`;
      if (descLen >= 110 && descLen <= 165) {
        updateCheckStatus(window.checkDesc, 'success');
        score += wDesc;
        checksPassed++;
      } else if (descLen > 0) {
        updateCheckStatus(window.checkDesc, 'warning');
        score += Math.round(wDesc * 0.3);
      } else {
        updateCheckStatus(window.checkDesc, 'pending');
      }
    }

    // 3. Word Count (Min 300 words)
    const plainText = bodyHtml.replace(/<[^>]*>/g, ' ');
    const wordCount = plainText.split(/\s+/).filter(w => w.length > 0).length;
    if (window.checkContent) {
      window.checkContent.querySelector('.val').textContent = `${wordCount} words`;
      if (wordCount >= 300) {
        updateCheckStatus(window.checkContent, 'success');
        score += wContent;
        checksPassed++;
      } else if (wordCount > 0) {
        updateCheckStatus(window.checkContent, 'warning');
        score += Math.round(wContent * 0.3);
      } else {
        updateCheckStatus(window.checkContent, 'pending');
      }
    }

    // 4. Keyword Density (At least 3 matches)
    let kwMatchCount = 0;
    if (primaryKeyword) {
      const regex = new RegExp(primaryKeyword.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'), 'gi');
      const matches = plainText.match(regex);
      if (matches) kwMatchCount = matches.length;
    }
    if (window.checkKeywords) {
      window.checkKeywords.querySelector('.val').textContent = `${kwMatchCount} matches`;
      if (kwMatchCount >= 3) {
        updateCheckStatus(window.checkKeywords, 'success');
        score += wKeywords;
        checksPassed++;
      } else if (kwMatchCount > 0) {
        updateCheckStatus(window.checkKeywords, 'warning');
        score += Math.round(wKeywords * 0.3);
      } else {
        updateCheckStatus(window.checkKeywords, 'pending');
      }
    }

    // 5. Keyword in Intro
    let hasIntroKw = false;
    if (primaryKeyword && plainText) {
      const sentences = plainText.split('.').map(s => s.trim()).filter(s => s.length > 0);
      const introText = sentences.slice(0, 3).join(' ').toLowerCase();
      hasIntroKw = introText.includes(primaryKeyword.toLowerCase());
    }
    if (window.checkIntro) {
      if (hasIntroKw) {
        updateCheckStatus(window.checkIntro, 'success');
        score += wIntro;
        checksPassed++;
      } else if (primaryKeyword && bodyHtml.length > 0) {
        updateCheckStatus(window.checkIntro, 'warning');
      } else {
        updateCheckStatus(window.checkIntro, 'pending');
      }
    }

    // 6. Subheadings H2/H4 (Min 2)
    const headingTag = activeSiteConfig.seo.headingTag;
    const headingRegex = new RegExp(`<${headingTag}[^>]*>`, 'gi');
    const headingMatches = (bodyHtml.match(headingRegex) || []).length;
    const hasH1 = /<h1[^>]*>/i.test(bodyHtml);
    if (window.checkHeadings) {
      window.checkHeadings.querySelector('.val').textContent = `${headingMatches} ${headingTag.toUpperCase()}`;
      if (headingMatches >= 2 && !hasH1) {
        updateCheckStatus(window.checkHeadings, 'success');
        score += wHeadings;
        checksPassed++;
      } else if (headingMatches > 0 || hasH1) {
        updateCheckStatus(window.checkHeadings, 'warning');
      } else {
        updateCheckStatus(window.checkHeadings, 'pending');
      }
    }

    // 7. FAQ Section (Optional based on config)
    if (requireFaq && window.checkFaq) {
      const faqPatterns = [/faq/i, /frequently asked questions/i, /doubt/i, /common question/i];
      const hasFaq = faqPatterns.some(pat => pat.test(plainText)) && new RegExp(`<${activeSiteConfig.seo.subheadingTag || 'h3'}[^>]*>`, 'i').test(bodyHtml);
      if (hasFaq) {
        updateCheckStatus(window.checkFaq, 'success');
        score += wFaq;
        checksPassed++;
      } else if (bodyHtml.length > 0) {
        updateCheckStatus(window.checkFaq, 'warning');
      } else {
        updateCheckStatus(window.checkFaq, 'pending');
      }
    }

    // 8. Conclusion Section (Optional based on config)
    if (requireConclusion && window.checkConclusion) {
      const conclusionPatterns = [/conclusion/i, /summary/i, /wrapping up/i, /final thoughts/i];
      const hasConclusion = conclusionPatterns.some(pat => pat.test(plainText));
      if (hasConclusion) {
        updateCheckStatus(window.checkConclusion, 'success');
        score += wConclusion;
        checksPassed++;
      } else if (bodyHtml.length > 0) {
        updateCheckStatus(window.checkConclusion, 'warning');
      } else {
        updateCheckStatus(window.checkConclusion, 'pending');
      }
    }

    // 9. Internal Landing Page links
    const hrefMatches = [...bodyHtml.matchAll(/<a\s+[^>]*href=["']([^"']+)["']/gi)];
    const hasInternalLink = hrefMatches.some(match => {
      const href = match[1];
      return href.includes('{{COURSE_URL}}') || (landingUrl && href.includes(landingUrl));
    });
    if (window.checkInternalLinks) {
      if (hasInternalLink) {
        updateCheckStatus(window.checkInternalLinks, 'success');
        score += wInternal;
        checksPassed++;
      } else if (bodyHtml.length > 0) {
        updateCheckStatus(window.checkInternalLinks, 'warning');
      } else {
        updateCheckStatus(window.checkInternalLinks, 'pending');
      }
    }

    // 10. Styled CTA Link
    const ctaTextPatterns = activeSiteConfig.seo.ctaTextPattern.map(p => new RegExp(p, 'i'));
    let hasCta = false;
    
    if (activeSiteId === 'novox_core') {
      hasCta = new RegExp(`<a\\s+[^>]*class=["'][^"']*${activeSiteConfig.seo.ctaAnchorClass}[^"']*["'][^>]*href=["']contact\\.html["']`, 'i').test(bodyHtml);
    } else {
      const ctaContainerMatches = [...bodyHtml.matchAll(new RegExp(`<div\\s+[^>]*class=["'][^"']*${activeSiteConfig.seo.ctaClass}[^"']*["'][^>]*>([\\s\\S]*?)<\\/div>`, 'gis'))];
      hasCta = ctaContainerMatches.some(ctaMatch => {
        const innerHtml = ctaMatch[1];
        const aMatches = [...innerHtml.matchAll(new RegExp(`<a\\s+[^>]*class=["'][^"']*${activeSiteConfig.seo.ctaAnchorClass}[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>`, 'gis'))];
        return aMatches.some(aMatch => {
          const href = aMatch[1];
          const text = aMatch[2].replace(/<[^>]*>/g, '').trim();
          return (href.includes('contact.html') || href === 'contact.html') && ctaTextPatterns.some(pat => pat.test(text));
        });
      });
    }

    if (window.checkCta) {
      if (hasCta) {
        updateCheckStatus(window.checkCta, 'success');
        score += wCta;
        checksPassed++;
      } else if (bodyHtml.length > 0) {
        updateCheckStatus(window.checkCta, 'warning');
      } else {
        updateCheckStatus(window.checkCta, 'pending');
      }
    }

    // 11. Slug format
    const slugRegex = /^[a-z0-9-]+$/;
    if (window.checkSlug) {
      if (slug.length > 0 && slugRegex.test(slug)) {
        updateCheckStatus(window.checkSlug, 'success');
        score += wSlug;
        checksPassed++;
      } else if (slug.length > 0) {
        updateCheckStatus(window.checkSlug, 'warning');
      } else {
        updateCheckStatus(window.checkSlug, 'pending');
      }
    }

    // Update Circular Chart & Score Number (Ensure absolute max 100)
    score = Math.min(100, score);
    scoreNum.textContent = score;
    const strokeDash = `${score}, 100`;
    scoreProgress.setAttribute('stroke-dasharray', strokeDash);

    if (score >= 90) {
      scoreProgress.style.stroke = 'var(--success-color)';
    } else if (score >= 60) {
      scoreProgress.style.stroke = 'var(--warning-color)';
    } else {
      scoreProgress.style.stroke = 'var(--danger-color)';
    }

    // Enable Publish if optimization score is 80+
    publishBtn.disabled = score < 80;
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

  // Re-bind listeners for real-time verification checks
  [editorTitle, editorDesc, editorContent, slugInput].forEach(el => {
    el.addEventListener('input', runSEOChecklist);
  });

  const isPreviewTabActive = () => {
    const previewTabBtn = document.querySelector('.tab-btn[data-tab="preview-tab"]');
    return previewTabBtn && previewTabBtn.classList.contains('active');
  };

  const updatePreviewIfActive = () => {
    if (isPreviewTabActive()) {
      renderSimulatorPreview();
    }
  };

  if (publishDateInput) publishDateInput.addEventListener('change', updatePreviewIfActive);
  if (authorInput) authorInput.addEventListener('input', updatePreviewIfActive);
  if (categorySelect) categorySelect.addEventListener('change', updatePreviewIfActive);

  // -------------------------------------------------------------
  // Verify & Publish (Commit via backend REST API)
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
    consoleOverlay.classList.add('active');
    consoleOutput.innerHTML = '';
    closeConsoleBtn.classList.add('hidden');
    liveCommitLink.classList.add('hidden');
    
    consoleStatus.querySelector('.status-indicator').className = 'status-indicator processing';
    consoleStatus.querySelector('.status-msg').textContent = 'Authenticating transaction...';

    writeLog(`Initializing blog publication client validation for ${activeSiteConfig.displayName}...`, 'info');

    const title = editorTitle.value.trim();
    const description = editorDesc.value.trim();
    const content_html = editorContent.value.trim();
    const slug = slugInput.value.trim();
    const category = categorySelect.value;
    const author = authorInput.value.trim();
    const image = imageUrlInput.value.trim();
    const keyword = primaryKeywordInput.value.trim();
    const landing_url = landingUrlInput.value.trim();

    const dateFormatted = formatYYYYMMDDToDateString(publishDateInput.value) || new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    });

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

    // b. Headings Check
    const hasH1 = /<h1[^>]*>/i.test(content_html);
    if (hasH1) {
      writeLog('VALIDATION ERROR: Semantic hierarchy mismatch. Do NOT include <h1> tags inside the content body.', 'error');
      consoleStatus.querySelector('.status-indicator').className = 'status-indicator failed';
      consoleStatus.querySelector('.status-msg').textContent = 'Verification Failed';
      closeConsoleBtn.classList.remove('hidden');
      return;
    }

    const hTag = activeSiteConfig.seo.headingTag;
    const hRegex = new RegExp(`<${hTag}[^>]*>`, 'gi');
    const hCount = (content_html.match(hRegex) || []).length;
    if (hCount < 2) {
      writeLog(`VALIDATION ERROR: Semantic hierarchy mismatch. Must include at least two <${hTag.toUpperCase()}> subheadings. Found ${hCount}.`, 'error');
      consoleStatus.querySelector('.status-indicator').className = 'status-indicator failed';
      consoleStatus.querySelector('.status-msg').textContent = 'Verification Failed';
      closeConsoleBtn.classList.remove('hidden');
      return;
    }

    writeLog('SEO checklist passed. Generating payload...', 'success');
    
    try {
      writeLog(`Sending transaction to Git Engine on backend...`, 'info');
      
      const res = await fetch('/api/publish', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${passcode}`,
          'x-site-id': activeSiteId
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
          image_base64: generatedImageBase64,
          original_filename: loadedOriginalFilename
        })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Server publishing failed');
      }

      const data = await res.json();

      writeLog(`API: Pulled blog template: "${activeSiteConfig.files.template}" successfully.`, 'info');
      writeLog(`API: Compiled static page payload: "${slug}.html".`, 'info');
      writeLog(`API: Injected listing card card into "${activeSiteConfig.files.gridPage}" container.`, 'info');
      writeLog(`API: Appended URL to "${activeSiteConfig.files.sitemap}".`, 'info');
      writeLog('GitHub: Combined updates into single transactional tree.', 'success');
      writeLog(`GitHub: Created commit SHA ${data.commit_sha.substring(0, 7)}.`, 'success');
      writeLog(`GitHub: Advanced heads/main reference successfully.`, 'success');
      writeLog('Website publication committed successfully!', 'success');

      await populateExistingBlogsDropdown();
      generatedImageBase64 = null;

      consoleStatus.querySelector('.status-indicator').className = 'status-indicator success';
      consoleStatus.querySelector('.status-msg').textContent = 'Pushed to GitHub Successfully!';
      
      liveCommitLink.href = data.commit_url;
      liveCommitLink.classList.remove('hidden');

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

  closeConsoleBtn.addEventListener('click', () => {
    consoleOverlay.classList.remove('active');
  });

  // Initial Boot Populators
  populateExistingBlogsDropdown();
  runSEOChecklist();
});
