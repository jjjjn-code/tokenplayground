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

Go to github.com, your profile picture, **Settings**, **Developer settings**, **GitHub Apps**, **New GitHub App** (or **Edit** next to an app you already made). The app's settings are split over several pages, listed in the left menu.

**General**

- **GitHub App name**: any name, for example `jn token tool`. It must be unique on GitHub. The tool does not depend on the name.
- **Homepage URL**: your Vercel address.
- **Redirect URI** (called **Callback URL** on older versions of the page), under the heading **Identifying and authorizing users**: your Vercel address followed by `/api/auth/callback`, exactly, with no slash at the end, for example `https://tokenplayground.vercel.app/api/auth/callback`. To also use the tool on your computer, add a second one: `http://localhost:3000/api/auth/callback`.
- **Expire user authorization tokens**: leave ticked.
- **Request user authorization (OAuth) during installation**: leave unticked.
- **Webhook**: untick **Active**.
- **Where can this GitHub App be installed?**: Only on this account.

Press **Save changes** (or **Create GitHub App** the first time).

**Permissions & events**

Under **Repository permissions**, set:

- **Contents**: Read and write
- **Pull requests**: Read and write
- Metadata is set to Read-only automatically.

Leave everything else as No access, and press **Save changes**.

**Credentials**

- **Client ID**: shown on the General page. Copy it.
- **Client secrets** tab: press **New secret** and copy the secret straight away. GitHub shows it only once; if you lose it, make another. Keep it private: it only goes into Vercel.
- **Key pairs** tab: if GitHub asks for a private key before you can install the app, generate one here. Keep the downloaded file on your computer; do not upload or share it. The tool does not use it.

## 4. Install the app on the 2 repos

1. In the app's left menu, choose **Install App**, then **Install** next to your account.
2. Pick **Only select repositories** and choose `ual-tokens-data` and `ual-tokens-sandbox`. Do not include any other repo.
3. Press **Install**.

The app can now only reach those 2 repos, and only for people who also have access to them.

## 5. Add the settings to Vercel

In Vercel: your project, **Settings**, **Environment Variables**. Add each of these for all environments:

| Name | Value |
| --- | --- |
| `GITHUB_APP_CLIENT_ID` | The Client ID from step 3 (General page) |
| `GITHUB_APP_CLIENT_SECRET` | The client secret from step 3 (Credentials page) |
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

- **"GitHub refused access (403 or 404)"**: the app is not installed on that repo, or is missing a permission from step 3. Check **Install App** and **Permissions & events**.
- **Sign-in returns to the tool with no change, or GitHub shows a redirect error**: the Redirect URI in step 3 does not match the address you are using exactly.
- **"... is empty"**: the repo has no files yet; ask Claude to fill it (step 1).
- **Someone else changed this**: another person saved first. Your edits are reapplied on top of theirs; check the tokens it lists and save again.

## Moving to UAL's organisation later

Create the app under the UAL organisation instead (organisation **Settings**, **Developer settings**, **GitHub Apps**), install it on the organisation's repos, and change `TOKENS_DATA_REPO` and `TOKENS_CODE_REPO` in Vercel. No code changes are needed.
