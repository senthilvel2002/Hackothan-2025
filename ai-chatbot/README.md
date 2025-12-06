<a href="https://github.com">
  <img alt="Next.js 14 and App Router-ready AI chatbot." src="app/(chat)/opengraph-image.png">
  <h1 align="center">Chat SDK</h1>
</a>

<p align="center">
    Chat SDK is a free, open-source template built with Next.js and the AI SDK that helps you quickly build powerful chatbot applications.
</p>

<p align="center">
  <a href="https://chat-sdk.dev"><strong>Read Docs</strong></a> ·
  <a href="#features"><strong>Features</strong></a> ·
  <a href="#model-providers"><strong>Model Providers</strong></a> ·
  <a href="#running-locally"><strong>Running locally</strong></a>
</p>
<br/>

## Features

- [Next.js](https://nextjs.org) App Router
  - Advanced routing for seamless navigation and performance
  - React Server Components (RSCs) and Server Actions for server-side rendering and increased performance
- [AI SDK](https://ai-sdk.dev/docs/introduction)
  - Unified API for generating text, structured objects, and tool calls with LLMs
  - Hooks for building dynamic chat and generative user interfaces
  - Supports xAI (default), OpenAI, Fireworks, and other model providers
- [shadcn/ui](https://ui.shadcn.com)
  - Styling with [Tailwind CSS](https://tailwindcss.com)
  - Component primitives from [Radix UI](https://radix-ui.com) for accessibility and flexibility
- Data Persistence
  - In-memory storage for chat history and user data (no database required)
  - In-memory file storage (replace with your preferred solution for production)
- [Auth.js](https://authjs.dev)
  - Simple and secure authentication
  - No environment variables required (uses default secrets for development)

## Model Providers

This template uses the AI Gateway to access multiple AI models through a unified interface. The default configuration includes [xAI](https://x.ai) models (`grok-2-vision-1212`, `grok-3-mini`) routed through the gateway.

### AI Gateway Authentication

Configure your AI Gateway settings as needed. The application will work without any environment variables.

With the [AI SDK](https://ai-sdk.dev/docs/introduction), you can also switch to direct LLM providers like [OpenAI](https://openai.com), [Anthropic](https://anthropic.com), [Cohere](https://cohere.com/), and [many more](https://ai-sdk.dev/providers/ai-sdk-providers) with just a few lines of code.

## Running locally

**No environment variables required!** The application works out of the box.

```bash
pnpm install
pnpm dev
```

Your app template should now be running on [localhost:3000](http://localhost:3000).

### Optional Configuration

If you want to customize the application, you can optionally create a `.env.local` file. See [ENV_VARIABLES.md](ENV_VARIABLES.md) for details.

> Note: You should not commit your `.env.local` file or it will expose secrets that will allow others to control access to your various AI and authentication provider accounts.

## Git Setup

### Initializing a Git Repository

If you're starting a new project or want to initialize version control for this project:

```bash
# Initialize a new git repository in the current directory
# This creates a hidden .git folder that tracks all your changes
git init

# Add all files to staging area (prepares them for commit)
# The '.' means all files in current directory and subdirectories
# You can also add specific files: git add filename.txt
git add .

# Create your first commit with a descriptive message
# This saves a snapshot of your files at this point in time
# Use meaningful messages like: "Add authentication feature" or "Fix login bug"
git commit -m "Initial commit"

# Add the remote repository (GitHub in this case)
# 'origin' is the default name for your remote repository
# This connects your local repo to the GitHub repository
git remote add origin https://github.com/senthilvel2002/Hackothan-2025.git

# Push to remote repository and set upstream branch
# -u (or --set-upstream) links your local 'main' branch to remote 'main' branch
# After this, you can use 'git push' without specifying origin main
git push -u origin main
```

**Note:** If the repository already exists, you can skip the `git init` step. If you need to change the remote URL, use:
```bash
# Update the remote repository URL (useful if URL changed or was incorrect)
git remote set-url origin https://github.com/senthilvel2002/Hackothan-2025.git

# Verify the remote URL was set correctly
git remote -v
```

### Pulling Latest Changes

To get the latest changes from a remote repository:

```bash
# Pull latest changes from the default branch (usually main or master)
# This fetches and merges changes from the remote repository
# Use this when you want to update your local code with remote changes
git pull

# Pull from a specific remote and branch
# Explicitly specify which remote (origin) and branch (main) to pull from
git pull origin main

# Pull and rebase your local changes on top of remote changes
# This replays your local commits on top of the remote changes
# Creates a cleaner, linear history (preferred for shared branches)
git pull --rebase

# Fetch changes without merging (to review before pulling)
# Downloads changes but doesn't merge them into your working directory
# Allows you to review changes before deciding to merge
git fetch

# Then merge after reviewing fetched changes
# Combines the fetched changes into your current branch
git merge origin/main
```

**Common Scenarios:**

- **First time cloning:** Use `git clone https://github.com/senthilvel2002/Hackothan-2025.git` instead of `git pull`
  - This downloads the entire repository to your local machine
  - Automatically sets up the remote connection
- **After pulling:** If there are conflicts, resolve them manually and then commit
  - Git will mark conflicted files - edit them to resolve conflicts
  - After resolving: `git add .` then `git commit`
- **Before pulling:** It's good practice to commit or stash your local changes first
  - Commit: `git add .` then `git commit -m "message"`
  - Or stash: `git stash` (saves changes temporarily), then `git stash pop` after pull

### Pushing Changes to Repository

To push your local changes to the remote repository:

```bash
# Check the status of your repository first (optional but recommended)
# Shows which files are modified, staged, or untracked
git status

# Add all modified files to staging area
# The '.' means all files - you can also add specific files: git add filename.ts
# Staging prepares files to be committed
git add .

# Commit your changes with a descriptive message
# Write clear, concise messages describing what changed and why
# Examples: "Fix login authentication bug", "Add user profile page", "Update dependencies"
git commit -m "Your commit message describing the changes"

# Push to the remote repository (first time or if upstream not set)
# Sends your commits to GitHub repository
# 'origin' is the remote name, 'main' is the branch name
git push origin main

# Or if you've already set upstream (with -u flag), simply use:
# Git remembers where to push, so you don't need to specify origin main
git push
```

**Additional Useful Commands:**

```bash
# View commit history (see all your commits)
git log

# View a shorter, one-line version of commit history
git log --oneline

# Check which remote repositories are configured
git remote -v

# View differences between your working directory and staged changes
git diff

# View differences between staged changes and last commit
git diff --staged

# Undo changes to a file (before staging)
git checkout -- filename.ts

# Unstage a file (remove from staging area but keep changes)
git reset HEAD filename.ts

# Create a new branch
git branch feature-branch-name

# Switch to a different branch
git checkout feature-branch-name

# Create and switch to a new branch in one command
git checkout -b feature-branch-name
```

**Repository URL:** [https://github.com/senthilvel2002/Hackothan-2025.git](https://github.com/senthilvel2002/Hackothan-2025.git)