# Setting up push to GitHub

This guide connects the token tool to GitHub, so it can save tokens to `ual-tokens-data` and open pull requests in `ual-tokens-sandbox`. It takes about 20 minutes. Do the steps in order.

You can try push before any of this in demo mode: run `npm run demo` and open http://localhost:3000. Demo mode uses a fake GitHub inside the tool and resets when it restarts.

## 1. Create the 2 repos

On github.com/new, create 2 **private** repos on your account, with nothing ticked (no README, no licence):

- `ual-tokens-data`
- `ual-tokens-sandbox`

Claude fills them with the starting files: the dummy token set in the data repo, and CSS generated from it in the sandbox.

## 2. Put the tool on Vercel

1. Sign in at vercel.com with your GitHub account.
2. Choose **Add New**, then **Project**, and import `tokenplayground`.
3. Press **Deploy**. Vercel detects Next.js by itself.
4. Note the web address Vercel gives the project, for example `https://tokenplayground.vercel.app`. You need it in step 3.

The tool works straight away in local mode (edits kept in your browser) until step 5 is done.

## 3. Create the GitHub App

If you have already created it, open it again from **Settings**, **Developer settings**, **GitHub Apps**, **Edit**, and check each setting below on the **General** tab, then press **Save changes** at the bottom.

1. Go to github.com, your profile picture, **Settings**, **Developer settings**, **GitHub Apps**, **New GitHub App**.
2. Fill in:
   - **GitHub App name**: any name, for example `jn token tool`. It must be unique on GitHub. The tool does not depend on the name.
   - **Homepage URL**: your Vercel address.
   - **Callback URL**: this is a text box, not a column. Scroll down to the heading **Identifying and authorizing users**; Callback URL is the first box under it. Enter your Vercel address followed by `/api/auth/callback`, for example `https://tokenplayground.vercel.app/api/auth/callback`. To also use the tool on your computer, press **Add Callback URL** and add `http://localhost:3000/api/auth/callback`.
   - **Expire user authorization tokens** (same section): leave ticked.
   - **Request user authorization (OAuth) during installation** (same section): leave unticked.
   - **Webhook**: untick **Active**.
3. Under **Permissions**, **Repository permissions**, set:
   - **Contents**: Read and write
   - **Pull requests**: Read and write
   - (Metadata is set to Read-only automatically.)
   Leave everything else as No access.
4. **Where can this GitHub App be installed?**: Only on this account.
5. Press **Create GitHub App**.
6. On the page that opens, copy the **Client ID**. Then press **Generate a new client secret** and copy the secret straight away; GitHub only shows it once.

## 4. Install the app on the 2 repos

1. On the app's page, choose **Install App** in the left menu, then **Install** next to your account.
2. Pick **Only select repositories** and choose `ual-tokens-data` and `ual-tokens-sandbox`. Do not include any other repo.
3. Press **Install**.

The app can now only reach those 2 repos, and only for people who also have access to them.

## 5. Add the settings to Vercel

In Vercel: your project, **Settings**, **Environment Variables**. Add each of these for all environments:

| Name | Value |
| --- | --- |
| `GITHUB_APP_CLIENT_ID` | The Client ID from step 3 |
| `GITHUB_APP_CLIENT_SECRET` | The client secret from step 3 |
| `SESSION_SECRET` | A long random string. On a Mac, run `openssl rand -base64 32` in Terminal and paste the result |
| `TOKENS_DATA_REPO` | `jjjjn-code/ual-tokens-data` |
| `TOKENS_CODE_REPO` | `jjjjn-code/ual-tokens-sandbox` |

Then go to **Deployments**, open the menu on the latest deployment and choose **Redeploy**, so the new settings take effect.

## 6. Check it works

1. Open your Vercel address. You should see **Sign in with GitHub**.
2. Sign in and approve the app. The token table loads from `ual-tokens-data`.
3. Change a value, press **Save** at the bottom of the sidebar, then open **Push to code**, give it a title and press **Open pull request**.
4. The pull request appears in `ual-tokens-sandbox` with the changelog.

## If something goes wrong

- **"GitHub refused access (403 or 404)"**: the app is not installed on that repo, or is missing a permission from step 3. Check **Install App** and the repository permissions.
- **Sign-in returns to the tool with no change**: the callback URL in step 3 does not match the address you are using exactly.
- **"... is empty"**: the repo has no files yet; ask Claude to fill it (step 1).
- **Someone else changed this**: another person saved first. Your edits are reapplied on top of theirs; check the tokens it lists and save again.

## Moving to UAL's organisation later

Create the app under the UAL organisation instead (organisation **Settings**, **Developer settings**, **GitHub Apps**), install it on the organisation's repos, and change `TOKENS_DATA_REPO` and `TOKENS_CODE_REPO` in Vercel. No code changes are needed.
