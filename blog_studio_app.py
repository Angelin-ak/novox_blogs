import streamlit as st
import os
import json
import re
from datetime import datetime
from google import genai
from google.genai import types
import git

# Sibling Repository Path configuration
REPO_PATH = "../novox_website_2026_new"

# -------------------------------------------------------------
# Premium Aesthetics & CSS styling
# -------------------------------------------------------------
st.set_page_config(
    page_title="Novox Edtech | Blog Studio",
    page_icon=os.path.join(REPO_PATH, "assets/img/logo/novox2.png") if os.path.exists(os.path.join(REPO_PATH, "assets/img/logo/novox2.png")) else "📝",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Inject Custom Cyberpunk / Premium Dark Theme styling
st.markdown("""
<style>
    /* Dark mode body adjustments */
    .stApp {
        background-color: #0b0f19;
        background-image: 
            radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.15) 0px, transparent 50%),
            radial-gradient(at 100% 100%, rgba(59, 130, 246, 0.15) 0px, transparent 50%);
        background-attachment: fixed;
        color: #e2e8f0;
    }
    
    /* Headings */
    h1, h2, h3, h4 {
        color: #ffffff !important;
        font-family: 'Inter', system-ui, sans-serif;
    }
    
    .main-title {
        font-size: 2.8rem;
        font-weight: 800;
        background: linear-gradient(135deg, #3b82f6, #6366f1);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin-bottom: 2rem;
        text-shadow: 0 0 30px rgba(99, 102, 241, 0.2);
    }
    
    /* Streamlit widgets overrides */
    .stButton>button {
        background: linear-gradient(135deg, #3b82f6, #6366f1) !important;
        color: white !important;
        border: none !important;
        border-radius: 8px !important;
        padding: 0.6rem 2rem !important;
        font-weight: 700 !important;
        box-shadow: 0 4px 15px rgba(59, 130, 246, 0.3) !important;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        width: 100%;
    }
    .stButton>button:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 6px 20px rgba(59, 130, 246, 0.5) !important;
    }
    
    .stTextInput>div>div>input, .stTextArea>div>textarea, .stSelectbox>div>div>div {
        background-color: rgba(15, 23, 42, 0.5) !important;
        border: 1px solid rgba(255, 255, 255, 0.1) !important;
        color: #e2e8f0 !important;
        border-radius: 8px !important;
    }
    
    .stTextInput>div>div>input:focus, .stTextArea>div>textarea:focus {
        border-color: #3b82f6 !important;
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3) !important;
    }
    
    /* Sidebar styling */
    .css-1542z7w, [data-testid="stSidebar"] {
        background-color: rgba(17, 24, 39, 0.8) !important;
        backdrop-filter: blur(12px) !important;
        border-right: 1px solid rgba(255, 255, 255, 0.05) !important;
    }
    
    /* Glassmorphic boxes */
    .glass-box {
        background: rgba(17, 24, 39, 0.6);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 20px;
        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
    }
</style>
""", unsafe_allow_html=True)

# -------------------------------------------------------------
# Configuration and Load Settings
# -------------------------------------------------------------
def get_git_info():
    try:
        repo = git.Repo(REPO_PATH)
        branch = repo.active_branch.name
        return branch
    except Exception:
        return "Unknown"

# Load configurations from local environment or .env if exist
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ADMIN_PASSCODE = os.getenv("ADMIN_PASSCODE", "novox2026admin")

# -------------------------------------------------------------
# Streamlit Interface Routing
# -------------------------------------------------------------
st.sidebar.image("https://novoxedtechllp.com/assets/img/logo/novox-edtech-calicut-logo.png", width=220)
st.sidebar.markdown("---")
st.sidebar.markdown(f"**🌿 Git Active Branch:** `{get_git_info()}`")

# Passcode Authorization Check
if "authenticated" not in st.session_state:
    st.session_state.authenticated = False

if not st.session_state.authenticated:
    st.markdown('<h1 class="main-title">🔐 Gate Passcode Required</h1>', unsafe_allow_html=True)
    passcode_input = st.text_input("Enter Admin Verification Passcode", type="password")
    
    if passcode_input == ADMIN_PASSCODE:
        st.session_state.authenticated = True
        st.rerun()
    elif passcode_input != "":
        st.error("Invalid Admin Passcode!")
    st.stop()

# Logout Sidebar button
if st.sidebar.button("Lock Dashboard"):
    st.session_state.authenticated = False
    st.rerun()

# Title Block
st.markdown('<h1 class="main-title">📝 Novox Blog Studio & Verification Hub</h1>', unsafe_allow_html=True)

# -------------------------------------------------------------
# Layout Setup
# -------------------------------------------------------------
col_input, col_editor = st.columns([1, 2], gap="large")

# -------------------------------------------------------------
# 1. USER INPUT PANEL (Left Column)
# -------------------------------------------------------------
with col_input:
    st.markdown('<div class="glass-box"><h3>⚙️ Blog Configuration</h3>', unsafe_allow_html=True)
    
    topic = st.text_input("Core Topic / Subject Matter", placeholder="e.g. Master React in 2026")
    keyword = st.text_input("Primary SEO Target Keyword", placeholder="e.g. React training Calicut")
    landing_url = st.text_input("Target Landing Course URL", value="mern-stack-course-detail.html")
    
    col_sub1, col_sub2 = st.columns(2)
    with col_sub1:
        category = st.selectbox("Category", [
            "Tech & Programming", "Career & Placement", "Digital Marketing", 
            "Web Development", "App Development", "Design", 
            "Artificial Intelligence", "Student & Learning"
        ])
    with col_sub2:
        author = st.text_input("Author Name", value="Novox Expert")
        
    image_path = st.text_input("Featured Image Path", value="assets/img/blog/new/generic_tech.png")
    api_key_override = st.text_input("Gemini API Key (Optional Override)", value=GEMINI_API_KEY, type="password")
    
    st.markdown('</div>', unsafe_allow_html=True)

    # Trigger Generation
    generate_clicked = st.button("🚀 Draft Article with AI")

# -------------------------------------------------------------
# Helper Functions for File Operations and Validation
# -------------------------------------------------------------
def get_category_style(cat_name):
    style_map = {
        'Tech & Programming': ('cat-tech', 'background:#fee2e2; color:#b91c1c;'),
        'Career & Placement': ('cat-career', 'background:#fce7f3; color:#be185d;'),
        'Digital Marketing': ('cat-marketing', 'background:#d1fae5; color:#065f46;'),
        'Web Development': ('cat-web', 'background:#dcfce7; color:#166534;'),
        'App Development': ('cat-app', 'background:#e0f2fe; color:#0369a1;'),
        'Design': ('cat-design', 'background:#fef3c7; color:#d97706;'),
        'Artificial Intelligence': ('cat-ai', 'background:#e0e7ff; color:#4338ca;'),
        'Student & Learning': ('cat-student', 'background:#f3e8ff; color:#6b21a8;')
    }
    return style_map.get(cat_name, ('cat-tech', 'background:#fee2e2; color:#b91c1c;'))

def generate_slug(title_str):
    slug = title_str.lower().strip()
    slug = re.sub(r'[^\w\s-]', '', slug)
    slug = re.sub(r'[\s_]+', '-', slug)
    return re.sub(r'-+', '-', slug)

# Initialize Session State values to save draft variables
if "title" not in st.session_state:
    st.session_state.title = ""
if "description" not in st.session_state:
    st.session_state.description = ""
if "content_html" not in st.session_state:
    st.session_state.content_html = ""
if "slug" not in st.session_state:
    st.session_state.slug = ""

# -------------------------------------------------------------
# 2. AI GENERATION ENGINE
# -------------------------------------------------------------
if generate_clicked:
    if not topic or not keyword or not landing_url:
        st.error("Please fill in Core Topic, Primary Keyword, and Course URL!")
    else:
        api_key = api_key_override if api_key_override else os.environ.get("GEMINI_API_KEY")
        if not api_key:
            st.error("Gemini API Key is not configured. Please enter it in the sidebar/input override.")
        else:
            with st.spinner("AI drafting in progress... Enforcing layout constraints..."):
                try:
                    client = genai.Client(api_key=api_key)
                    
                    system_instructions = (
                        "You are an expert copywriter for Novox Edtech (an IT and software training institute in Calicut, Kerala).\n"
                        "Generate a highly engaging, SEO-optimized blog article based on the user topic and keywords.\n"
                        "Strictly follow these content layout requirements:\n"
                        "1. Return your output as a valid JSON object containing exactly three keys:\n"
                        "   - 'title': A compelling, search-intent driven title (H1) containing the main keyword. Max 60 characters.\n"
                        "   - 'description': An engaging meta description (120-155 characters).\n"
                        "   - 'content_html': The HTML body content of the article.\n"
                        "2. In 'content_html', ensure the following content hierarchy is strictly enforced:\n"
                        "   - Do NOT include any H1 tag inside content_html (the main title acts as the H1).\n"
                        "   - Begin directly with an introduction summary paragraph that naturally weaves the target keyword into the first 2-3 sentences.\n"
                        "   - Focus heavily on human-centric student benefits, job placement, and career growth in Kerala/India, rather than just technical dry course listings.\n"
                        "   - Structure the sub-sections using semantic HTML <h2> and <h3> tags.\n"
                        "   - Provide a distinct 'Frequently Asked Questions' section before closure. Under this section, wrap each question in <h3> and answer in <p>.\n"
                        "   - Terminate with a strong conclusion summary paragraph.\n"
                        "   - Add an explicit standalone call-to-action (CTA) link mapping to the course URL. Use the exact placeholder string '{{COURSE_URL}}' for this href.\n"
                        "   - Ensure the keyword appears at least 3 times in the text.\n"
                        "Ensure the response matches application/json mime-type and contains valid, parsing JSON."
                    )
                    
                    prompt = (
                        f"Topic: {topic}\n"
                        f"Primary Keyword: {keyword}\n"
                        f"Category: {category}\n"
                        f"Author: {author}\n"
                        f"Draft an article meeting these exact properties."
                    )
                    
                    response = client.models.generate_content(
                        model='gemini-2.5-flash',
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            system_instruction=system_instructions,
                            response_mime_type="application/json"
                        )
                    )
                    
                    data = json.loads(response.text)
                    st.session_state.title = data.get("title", "")
                    st.session_state.description = data.get("description", "")
                    st.session_state.content_html = data.get("content_html", "")
                    st.session_state.slug = generate_slug(st.session_state.title)
                    
                    st.success("AI draft completed successfully!")
                except Exception as e:
                    st.error(f"Generation failed: {str(e)}")

# -------------------------------------------------------------
# 3. INTERACTIVE REVIEW WORKSPACE (Right Column)
# -------------------------------------------------------------
with col_editor:
    st.markdown('<h3>📝 Review & Edit Workspace</h3>', unsafe_allow_html=True)
    
    tab_write, tab_preview = st.tabs(["✍️ Content Editor", "👁️ Live Preview Simulator"])
    
    with tab_write:
        col_t1, col_t2 = st.columns([3, 2])
        with col_t1:
            st.session_state.title = st.text_input("SEO Blog Title (H1)", value=st.session_state.title)
        with col_t2:
            st.session_state.slug = st.text_input("File Slug", value=st.session_state.slug)
            
        st.session_state.description = st.text_area("Meta Description", value=st.session_state.description, rows=2)
        
        st.session_state.content_html = st.text_area(
            "Article HTML Body Content", 
            value=st.session_state.content_html, 
            height=400
        )
        
    with tab_preview:
        date_str = datetime.now().strftime("%B %d, %Y")
        
        simulated_html = f"""
        <div style="background-color: white; color: #1e293b; padding: 30px; border-radius: 12px; font-family: sans-serif; line-height: 1.8;">
            <div style="border-bottom: 2px solid #f1f5f9; padding-bottom: 15px; margin-bottom: 20px; font-size: 14px; color: #64748b;">
                <strong>NOVOX EDTECH</strong> &nbsp;|&nbsp; Category: <span style="color:#2563eb;">{category}</span>
            </div>
            <h1 style="font-size: 2.2rem; color: #0f172a; margin-bottom: 10px; line-height: 1.2;">{st.session_state.title}</h1>
            <div style="font-size: 13px; color: #64748b; margin-bottom: 20px;">
                <span>By {author}</span> &bull; <span>{date_str}</span>
            </div>
            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin-bottom: 20px;">
            <div class="sim-content" style="color: #334155;">
                {st.session_state.content_html.replace('{{COURSE_URL}}', landing_url)}
            </div>
        </div>
        """
        st.components.v1.html(simulated_html, height=500, scrolling=True)

    # -------------------------------------------------------------
    # 4. VALIDATION FILTER & DIRECT GIT DEPLOYMENT
    # -------------------------------------------------------------
    st.markdown("---")
    st.markdown("### 🔍 Validation Rules checklist")
    
    intro_check = False
    keyword_in_body = False
    
    plain_text = re.sub(r'<[^>]*>', ' ', st.session_state.content_html)
    
    if keyword:
        sentences = plain_text.strip().split('.')
        intro_sentences = ". ".join(sentences[:3])
        
        if keyword.lower() in intro_sentences.lower():
            intro_check = True
            
        if keyword.lower() in plain_text.lower():
            keyword_in_body = True
            
    h2_count = len(re.findall(r'<h2[^>]*>', st.session_state.content_html, re.IGNORECASE))
    faq_check = "frequently asked questions" in plain_text.lower() or "faq" in plain_text.lower()
    
    col_c1, col_c2, col_c3 = st.columns(3)
    with col_c1:
        if intro_check:
            st.success("✅ Keyword in Intro Paragraph")
        else:
            st.error("❌ Keyword not found in first 3 sentences")
    with col_c2:
        if h2_count >= 2:
            st.success(f"✅ Subheadings Hierarchy ({h2_count} H2s)")
        else:
            st.warning(f"⚠️ Needs H2 subheadings (Found {h2_count}/2)")
    with col_c3:
        if faq_check:
            st.success("✅ FAQ Section detected")
        else:
            st.warning("⚠️ FAQ section missing prior to closure")

    deploy_clicked = st.button("🚀 Verify & Deploy Live")
    
    if deploy_clicked:
        if not st.session_state.title or not st.session_state.content_html or not st.session_state.slug:
            st.error("Missing draft content! Load an AI draft or edit text fields.")
        elif not keyword:
            st.error("Please enter target SEO Keyword in the parameters list!")
        elif not intro_check:
            st.error(f"Validation Error: The target SEO keyword '{keyword}' must naturally exist in the introduction summary paragraph (first 3 sentences)!")
        else:
            with st.spinner("Compiling static files & publishing directly to GitHub..."):
                try:
                    # 1. Fetch local files templates from sibling repo path
                    template_path = os.path.join(REPO_PATH, "blog-template-v2.html")
                    if not os.path.exists(template_path):
                        raise FileNotFoundError(f"Could not find template blog-template-v2.html at {template_path}!")
                    
                    with open(template_path, "r", encoding="utf-8") as f:
                        template_html = f.read()
                        
                    # 2. Compile output page HTML
                    final_body_html = st.session_state.content_html.replace('{{COURSE_URL}}', landing_url)
                    
                    compiled_html = template_html \
                        .replace('{{TITLE}}', st.session_state.title) \
                        .replace('{{DESCRIPTION}}', st.session_state.description) \
                        .replace('{{CATEGORY}}', category) \
                        .replace('{{IMAGE}}', image_path) \
                        .replace('{{CONTENT}}', final_body_html)
                        
                    new_filename = f"{st.session_state.slug}.html"
                    new_filepath = os.path.join(REPO_PATH, new_filename)
                    
                    # Write to file in the website repository root
                    with open(new_filepath, "w", encoding="utf-8") as f:
                        f.write(compiled_html)
                        
                    st.info(f"Compiled file successfully: `{new_filepath}`")
                    
                    # 3. Update blogs.html
                    blogs_path = os.path.join(REPO_PATH, "blogs.html")
                    if not os.path.exists(blogs_path):
                        raise FileNotFoundError(f"Could not find blogs.html at {blogs_path}!")
                        
                    with open(blogs_path, "r", encoding="utf-8") as f:
                        blogs_html = f.read()
                        
                    cat_class, badge_style = get_category_style(category)
                    
                    card_html = f"""               <!-- Post: {st.session_state.title} -->
               <div class="col-xl-4 col-lg-6 col-md-6 mb-40 grid-item {cat_class}">
                  <div class="tp-blog-item modern-card">
                     <div class="tp-blog-thumb fix">
                        <a href="{new_filename}"><img alt="{st.session_state.title}" loading="lazy" src="{image_path}" /></a>
                     </div>
                     <div class="tp-blog-content modern-content">
                        <div class="tp-blog-tag mb-12">
                           <span class="modern-badge" style="{badge_style}">{category}</span>
                        </div>
                        <div class="tp-blog-meta-row d-flex align-items-center mb-15">
                           <span class="modern-date author-span">{author}</span>
                           <span class="modern-date">{date_str}</span>
                        </div>
                        <h3 class="tp-blog-title mb-20 modern-title"><a href="{new_filename}">{st.session_state.title}</a></h3>
                        <div class="spacer"></div>
                        <div class="tp-blog-btn flex-wrap d-flex align-items-center justify-content-between modern-footer">
                           <a class="read-more-link" href="{new_filename}">Read More</a>
                        </div>
                     </div>
                  </div>
               </div>\n"""

                    grid_marker = '<div class="row grid">'
                    grid_index = blogs_html.find(grid_marker)
                    if grid_index == -1:
                        raise ValueError("Could not find '<div class=\"row grid\">' in blogs.html")
                        
                    insert_pos = grid_index + len(grid_marker)
                    updated_blogs = blogs_html[:insert_pos] + "\n" + card_html + blogs_html[insert_pos:]
                    
                    with open(blogs_path, "w", encoding="utf-8") as f:
                        f.write(updated_blogs)
                        
                    st.info("Injected card element successfully into `blogs.html` grid.")
                    
                    # 4. Update sitemap.xml
                    sitemap_path = os.path.join(REPO_PATH, "sitemap.xml")
                    if not os.path.exists(sitemap_path):
                        raise FileNotFoundError(f"Could not find sitemap.xml at {sitemap_path}!")
                        
                    with open(sitemap_path, "r", encoding="utf-8") as f:
                        sitemap_xml = f.read()
                        
                    formatted_date = datetime.now().strftime("%Y-%m-%d")
                    sitemap_entry = f"""  <url>
    <loc>https://novoxedtechllp.com/{new_filename}</loc>
    <lastmod>{formatted_date}</lastmod>
    <priority>0.8</priority>
  </url>\n"""

                    urlset_marker = '</urlset>'
                    urlset_index = sitemap_xml.find(urlset_marker)
                    if urlset_index == -1:
                        raise ValueError("Could not find '</urlset>' inside sitemap.xml")
                        
                    updated_sitemap = sitemap_xml[:urlset_index] + sitemap_entry + sitemap_xml[urlset_index:]
                    
                    with open(sitemap_path, "w", encoding="utf-8") as f:
                        f.write(updated_sitemap)
                        
                    st.info("Registered URL inside `sitemap.xml` sitemap.")
                    
                    # 5. Git Commit and Push inside the target repository
                    st.info("Initializing background git commit transaction...")
                    repo = git.Repo(REPO_PATH)
                    
                    # Add files relative to repo root
                    repo.index.add([new_filename, "blogs.html", "sitemap.xml"])
                    
                    # Commit
                    commit_msg = f"feat(blog): publish post '{st.session_state.title}'"
                    new_commit = repo.index.commit(commit_msg)
                    st.success(f"Git commit created locally: `{new_commit.hexsha[:7]}`")
                    
                    # Push
                    st.info("Pushing updates to remote branch...")
                    origin = repo.remote(name='origin')
                    push_results = origin.push()
                    
                    for result in push_results:
                        if result.flags & git.PushInfo.ERROR:
                            raise Exception(f"Git push error flags: {result.summary}")
                            
                    st.balloons()
                    st.success(f"🎉 Pushed successfully! Commit: {new_commit.hexsha[:7]}. Deploy workflow triggered.")
                    
                except Exception as e:
                    st.error(f"Git Deployment failed: {str(e)}")
