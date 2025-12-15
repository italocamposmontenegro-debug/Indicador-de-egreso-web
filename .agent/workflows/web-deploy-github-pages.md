---
description: Deploy a Vite web app to GitHub Pages with CI/CD
---

This workflow standardizes the process of deploying a Vite-based web application to GitHub Pages.

1.  **Configure Vite Base Path**
    - Check `vite.config.js`.
    - Ensure `base` is set to `/<REPO_NAME>/`.
    - Example: `base: '/my-project/'`

2.  **Create GitHub Actions Workflow**
    - Create file: `.github/workflows/deploy.yml`
    - Content:
      ```yaml
      name: Deploy to GitHub Pages
      on:
        push:
          branches: ["main"]
      permissions:
        contents: read
        pages: write
        id-token: write
      concurrency:
        group: "pages"
        cancel-in-progress: true
      jobs:
        build:
          runs-on: ubuntu-latest
          steps:
            - uses: actions/checkout@v4
            - uses: actions/setup-node@v4
              with:
                node-version: '20'
                cache: 'npm'
            - run: npm ci
            - run: npm run build
            - uses: actions/upload-pages-artifact@v3
              with:
                path: ./dist
        deploy:
          environment:
            name: github-pages
            url: ${{ steps.deployment.outputs.page_url }}
          runs-on: ubuntu-latest
          needs: build
          steps:
            - id: deployment
              uses: actions/deploy-pages@v4
      ```

3.  **Initialize/Update Git**
    - `git init` (if new)
    - `git add .`
    - `git commit -m "feat: configure github pages deployment"`

4.  **Push to GitHub**
    - Ensure remote `origin` is set.
    - `git push -u origin main`

5.  **Verification**
    - Check "Actions" tab in GitHub.
    - Verify site loads at `https://<USER>.github.io/<REPO_NAME>/`.
