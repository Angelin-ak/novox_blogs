import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_OWNER || 'novoxedtechllp-dotcom';
  const repo = process.env.GITHUB_REPO || 'novox_website_2026_new';
  const branch = process.env.GITHUB_BRANCH || 'main';

  console.log("Using token:", token && token !== "your_github_personal_access_token_here" ? "VALID" : "PLACEHOLDER");
  console.log("Repo:", `${owner}/${repo}`);

  if (!token || token === "your_github_personal_access_token_here") {
    console.log("Cannot query GitHub: Token is not configured yet.");
    return;
  }

  try {
    const octokit = new Octokit({ auth: token });
    const res = await octokit.repos.getContent({
      owner,
      repo,
      path: 'blog-template-v2.html',
      ref: branch
    });
    const html = Buffer.from(res.data.content, 'base64').toString('utf8');
    
    // Find tp-postbox-comment-from or contact-form in template html
    console.log("=== Found Sections ===");
    console.log("Has contact-form:", html.includes('id="contact-form"'));
    console.log("Has tp-postbox-comment-from:", html.includes('tp-postbox-comment-from'));
    
    const index = html.indexOf('tp-postbox-comment-from');
    if (index !== -1) {
      console.log("=== Comment/Contact Form Section in Template ===");
      console.log(html.substring(index - 200, index + 2000));
    }
  } catch (err) {
    console.error("Error fetching template:", err.message);
  }
}

run();
