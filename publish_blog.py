import sys
import os
import json
import re
from datetime import datetime
import git

def validate_blog(data):
    title = data.get("title", "").strip()
    description = data.get("description", "").strip()
    content_html = data.get("content_html", "").strip()
    slug = data.get("slug", "").strip()
    keyword = data.get("keyword", "").strip()
    landing_url = data.get("landing_url", "").strip()

    if not title:
        raise ValueError("Title is missing.")
    if not description:
        raise ValueError("Description is missing.")
    if not content_html:
        raise ValueError("Content HTML is missing.")
    if not slug:
        raise ValueError("Slug is missing.")
    if not keyword:
        raise ValueError("Primary SEO Target Keyword is missing.")
    if not landing_url:
        raise ValueError("Target Landing Course URL is missing.")

    # Convert HTML to plain text to check keyword positioning
    plain_text = re.sub(r'<[^>]*>', ' ', content_html)
    
    # 1. Primary Keyword Optimization inside Introduction
    # Split into sentences (simple dot split)
    sentences = [s.strip() for s in plain_text.split('.') if s.strip()]
    intro_sentences = " ".join(sentences[:3])
    if keyword.lower() not in intro_sentences.lower():
        raise ValueError(
            f"Validation Error: The target SEO keyword '{keyword}' must naturally exist in the "
            "introduction summary paragraph (first 3 sentences)!"
        )

    # 2. Keyword Density Check (at least 3 times in total text)
    kw_count = plain_text.lower().count(keyword.lower())
    if kw_count < 3:
        raise ValueError(
            f"Validation Error: The targeted primary keyword '{keyword}' must appear at least 3 times "
            f"in the text for proper SEO optimization. Found {kw_count} times."
        )

    # 3. No H1 inside content_html (H1 is title)
    if re.search(r'<h1[^>]*>', content_html, re.IGNORECASE):
        raise ValueError(
            "Validation Error: Semantic hierarchy mismatch. Do NOT include <h1> tags inside the content body "
            "(the blog title serves as the only H1 for the page)."
        )

    # 4. Heading Hierarchy: Must contain at least two H2 tags
    h2_count = len(re.findall(r'<h2[^>]*>', content_html, re.IGNORECASE))
    if h2_count < 2:
        raise ValueError(
            f"Validation Error: Semantic hierarchy mismatch. Must include at least two H2 subheadings "
            f"for core educational topics. Found {h2_count}."
        )

    # 5. FAQ Section check (Frequently Asked Questions before closure)
    faq_patterns = [r"faq", r"frequently asked questions", r"doubt", r"common question"]
    has_faq = any(re.search(pat, plain_text, re.IGNORECASE) for pat in faq_patterns)
    if not has_faq:
        raise ValueError(
            "Validation Error: Core structural mismatch. A 'Frequently Asked Questions' (FAQ) section is "
            "explicitly required before the end to address common student doubts."
        )

    # 6. Conclusion check
    conclusion_patterns = [r"conclusion", r"summary", r"wrapping up", r"final thoughts"]
    has_conclusion = any(re.search(pat, plain_text, re.IGNORECASE) for pat in conclusion_patterns)
    if not has_conclusion:
        raise ValueError(
            "Validation Error: Core structural mismatch. A strong conclusion summary wrapping up the "
            "value proposition is required."
        )

    # 7. Internal Links to Course Page check
    # We check if there are links containing {{COURSE_URL}} or landing_url
    links = re.findall(r'<a\s+[^>]*href=["\']([^"\']+)["\']', content_html, re.IGNORECASE)
    has_internal_link = any('{{COURSE_URL}}' in l or landing_url in l for l in links)
    if not has_internal_link:
        raise ValueError(
            "Validation Error: Core structural mismatch. Relevant text within the blog body must "
            "seamlessly hyperlink back to matching NovoX course pages."
        )

    # 8. CTA Link at the end
    cta_patterns = [r"enroll", r"contact", r"register", r"join", r"start", r"apply", r"now", r"us"]
    # Let's check for links containing course url and CTA text
    has_cta = False
    for href_match, text_match in re.findall(r'<a\s+[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>', content_html, re.IGNORECASE | re.DOTALL):
        if 'contact.html' in href_match or href_match == 'contact.html':
            text_clean = re.sub(r'<[^>]*>', '', text_match).strip().lower()
            if any(re.search(pat, text_clean) for pat in cta_patterns):
                has_cta = True
                break
    if not has_cta:
        raise ValueError(
            "Validation Error: Core structural mismatch. Post must terminate with an explicit CTA "
            "action button or link targeting 'contact.html' with text like 'Enroll Now' or 'Contact Us'."
        )

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

def main():
    try:
        # Load JSON from stdin
        input_data = sys.stdin.read()
        if not input_data:
            print("Error: No input data provided.", file=sys.stderr)
            sys.exit(1)
            
        data = json.loads(input_data)
        
        # 1. Run structural & SEO validation filter
        validate_blog(data)
        
        # Get variables
        title = data.get("title").strip()
        description = data.get("description").strip()
        category = data.get("category").strip()
        author = data.get("author").strip()
        date_str = data.get("date", datetime.now().strftime("%b %d, %Y")).strip()
        image = data.get("image", "assets/img/blog/new/generic_tech.png").strip()
        content_html = data.get("content_html").strip()
        slug = data.get("slug").strip()
        landing_url = data.get("landing_url").strip()
        
        # Set Paths
        CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
        REPO_PATH = os.path.abspath(os.path.join(CURRENT_DIR, "..", "novox_website_2026_new"))
        
        # Verify template
        template_path = os.path.join(REPO_PATH, "blog-template-v2.html")
        if not os.path.exists(template_path):
            print(f"Error: Could not find template blog-template-v2.html at {template_path}!", file=sys.stderr)
            sys.exit(1)
            
        with open(template_path, "r", encoding="utf-8") as f:
            template_html = f.read()
            
        # 2. Compile output page HTML (replacing course url placeholder)
        final_body_html = content_html.replace('{{COURSE_URL}}', landing_url)
        
        compiled_html = template_html \
            .replace('{{TITLE}}', title) \
            .replace('{{DESCRIPTION}}', description) \
            .replace('{{CATEGORY}}', category) \
            .replace('{{IMAGE}}', image) \
            .replace('{{CONTENT}}', final_body_html)
            
        new_filename = f"{slug}.html"
        new_filepath = os.path.join(REPO_PATH, new_filename)
        
        # Write asset file
        with open(new_filepath, "w", encoding="utf-8") as f:
            f.write(compiled_html)
        print(f"Compiled file successfully: {new_filepath}")
        
        # 3. Update blogs.html
        blogs_path = os.path.join(REPO_PATH, "blogs.html")
        if not os.path.exists(blogs_path):
            print(f"Error: Could not find blogs.html at {blogs_path}!", file=sys.stderr)
            sys.exit(1)
            
        with open(blogs_path, "r", encoding="utf-8") as f:
            blogs_html = f.read()
            
        cat_class, badge_style = get_category_style(category)
        
        card_html = f"""               <!-- Post: {title} -->
               <div class="col-xl-4 col-lg-6 col-md-6 mb-40 grid-item {cat_class}">
                  <div class="tp-blog-item modern-card">
                     <div class="tp-blog-thumb fix">
                        <a href="{new_filename}"><img alt="{title}" loading="lazy" src="{image}" /></a>
                     </div>
                     <div class="tp-blog-content modern-content">
                        <div class="tp-blog-tag mb-12">
                           <span class="modern-badge" style="{badge_style}">{category}</span>
                        </div>
                        <div class="tp-blog-meta-row d-flex align-items-center mb-15">
                           <span class="modern-date author-span">{author}</span>
                           <span class="modern-date">{date_str}</span>
                        </div>
                        <h3 class="tp-blog-title mb-20 modern-title"><a href="{new_filename}">{title}</a></h3>
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
            print("Error: Could not find '<div class=\"row grid\">' in blogs.html", file=sys.stderr)
            sys.exit(1)
            
        insert_pos = grid_index + len(grid_marker)
        updated_blogs = blogs_html[:insert_pos] + "\n" + card_html + blogs_html[insert_pos:]
        
        with open(blogs_path, "w", encoding="utf-8") as f:
            f.write(updated_blogs)
        print("Injected card element successfully into blogs.html grid.")
        
        # 4. Update sitemap.xml
        sitemap_path = os.path.join(REPO_PATH, "sitemap.xml")
        if not os.path.exists(sitemap_path):
            print(f"Error: Could not find sitemap.xml at {sitemap_path}!", file=sys.stderr)
            sys.exit(1)
            
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
            print("Error: Could not find '</urlset>' inside sitemap.xml", file=sys.stderr)
            sys.exit(1)
            
        updated_sitemap = sitemap_xml[:urlset_index] + sitemap_entry + sitemap_xml[urlset_index:]
        
        with open(sitemap_path, "w", encoding="utf-8") as f:
            f.write(updated_sitemap)
        print("Registered URL inside sitemap.xml sitemap.")
        
        # 5. Git Commit and Push inside the target repository
        print("Initializing local git commit transaction...")
        repo = git.Repo(REPO_PATH)
        
        # Add files relative to repo root
        repo.index.add([new_filename, "blogs.html", "sitemap.xml"])
        
        # Commit
        commit_msg = f"feat(blog): publish post '{title}'"
        new_commit = repo.index.commit(commit_msg)
        print(f"Git commit created locally: {new_commit.hexsha[:7]}")
        
        # Push
        print("Pushing updates to remote branch...")
        origin = repo.remote(name='origin')
        push_results = origin.push()
        
        for result in push_results:
            if result.flags & git.PushInfo.ERROR:
                raise Exception(f"Git push error flags: {result.summary}")
                
        # Return JSON result on success
        result = {
            "success": True,
            "commit_sha": new_commit.hexsha,
            "commit_url": f"https://github.com/novoxedtechllp-dotcom/novox_website_2026_new/commit/{new_commit.hexsha}"
        }
        print(json.dumps(result))
        
    except ValueError as val_err:
        print(f"Validation Error: {str(val_err)}", file=sys.stderr)
        sys.exit(2)
    except Exception as err:
        print(f"Error: {str(err)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
