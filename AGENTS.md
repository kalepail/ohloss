# AGENTS.md - Available Tooling Reference

This document lists all available MCP tools and Task agents that can be used during development.

## Quick Start
- Reach for a Task agent when a problem spans multiple files or needs research; otherwise try local tooling first (`rg`, tests, docs).
- Skim the "Recommended Workflow" section before new feature work to avoid missing required setup steps.
- Use `context7` for up-to-date library documentation instead of relying on cached knowledge.
- Use `perplexity` for researching latest versions and best practices.

## Dependency Management

**CRITICAL: Always research package versions before adding or updating dependencies.**

### Current Core Dependencies
- **soroban-sdk**: 23.1.0
- **soroban-fixed-point-math**: git fork from github.com/kalepail/soroban-fixed-point-math

### Before Adding Dependencies:
1. Use perplexity or WebSearch to find the latest stable version
2. Check crates.io for compatibility information
3. Ensure the new dependency uses soroban-sdk 23.1.0
4. Add to workspace dependencies in root Cargo.toml
5. Use `{ workspace = true }` in contract Cargo.toml

### Example:
```bash
# Research the package first
perplexity: search("soroban-sdk latest version compatibility 2025")

# Get library documentation
context7: resolve-library-id("soroban-sdk")
context7: get-library-docs(libraryId, topic="storage")
```

## Task Agents

Launch specialized agents for complex, multi-step tasks using the Task tool.

### Explore Agent
**Best for:** Searching codebases, finding patterns, understanding structure

**When to use:**
- Finding files by pattern: "Find all .rs files in src/"
- Searching code: "Find all uses of fixed_mul_floor"
- Understanding structure: "How does fee-vault-v2 handle deposits?"
- If a quick `rg` search will do, try that first and jot down the query in case you need to escalate to Explore later.

**Thoroughness levels:**
- `quick` - Basic keyword search
- `medium` - Moderate exploration
- `very thorough` - Comprehensive analysis

**Example:**
```
Use Explore agent with "medium" thoroughness to find how Soroswap router handles swap operations
```

### General Purpose Agent
**Best for:** Complex multi-step tasks, research, code generation

**When to use:**
- Multi-step research
- Code refactoring
- Test generation
- Answering complex questions requiring multiple searches

**Example:**
```
Use general purpose agent to research Soroban contract upgrade patterns and provide implementation examples
```

### Plan Agent
**Best for:** Planning implementation approaches before coding

**When to use:**
- Breaking down complex features
- Exploring multiple implementation options
- Planning architecture decisions

## MCP Tools

### context7
**Purpose:** Get up-to-date library documentation and code examples

**Key operations:**
- `resolve-library-id(libraryName)` - Find library ID for documentation
- `get-library-docs(libraryId, topic?, mode?)` - Fetch documentation
  - `mode: "code"` - API references and code examples (default)
  - `mode: "info"` - Conceptual guides and architecture

**Use for:**
- Understanding soroban-sdk APIs
- Learning library patterns and best practices
- Getting current code examples

**Example:**
```
context7: resolve-library-id("stellar-sdk")
context7: get-library-docs("/stellar/js-stellar-sdk", topic="contract")
```

### github
**Purpose:** Interact with GitHub repositories

**Key operations:**
- `get_file_contents(owner, repo, path)` - Read file contents
- `search_code(query)` - Search across repos (e.g., "language:rust soroban")
- `list_branches(owner, repo)` - List branches
- `list_commits(owner, repo)` - List commits
- Create/read issues and PRs

**Use for:**
- Studying fee-vault-v2 source code
- Understanding Soroswap router implementation
- Finding Soroban contract examples
- Searching for specific patterns in Stellar repos

**Example:**
```
get_file_contents("script3", "fee-vault-v2", "src/vault.rs")
search_code("soroban-sdk Map usage language:rust")
```

### deepwiki
**Purpose:** Query AI-generated documentation about GitHub repositories

**Key operations:**
- `read_wiki_structure(repoName)` - Get documentation topics
- `read_wiki_contents(repoName)` - View full documentation
- `ask_question(repoName, question)` - Ask specific questions

**Use for:**
- Understanding project architecture
- Getting high-level explanations
- Learning usage patterns from repos

**Example:**
```
ask_question("script3/fee-vault-v2", "How do I integrate with a Blend pool?")
read_wiki_structure("soroswap/core")
```

### perplexity
**Purpose:** Web search and research with AI analysis

**Key operations:**
- `search(query)` - Quick search for straightforward questions
- `reason(query)` - Complex multi-step reasoning
- `deep_research(query, focus_areas?)` - In-depth research and reports

**Use for:**
- Finding latest Soroban documentation
- Researching package versions and compatibility
- Troubleshooting specific errors
- Getting up-to-date best practices

**Example:**
```
perplexity: search("soroban-sdk 23.1 breaking changes 2025")
perplexity: reason("What are the best practices for Soroban storage optimization?")
```

### cloudflare
**Purpose:** Search Cloudflare documentation

**Key operations:**
- `search_cloudflare_documentation(query)` - Search CF docs

**Use for:**
- Workers deployment (api-worker)
- Pages deployment (ohloss-frontend)
- D1, R2, KV documentation

**Relevant for this project** - ohloss-frontend and api-worker deploy to Cloudflare.

### WebSearch / WebFetch
**Purpose:** Direct web search and page fetching

**Use for:**
- Reading specific documentation pages
- Fetching blog posts or tutorials
- Getting content from known URLs

**Example:**
```
WebFetch: https://developers.stellar.org/docs/build/smart-contracts/overview
```

## Tool Selection Guide

### For researching Soroban/Stellar patterns:
1. **github** - Read source of fee-vault-v2, soroswap, soroban-examples
2. **context7** - Get library documentation with code examples
3. **deepwiki** - Ask questions about specific repos
4. **perplexity** - Find latest best practices and discussions

### For understanding dependencies:
1. **context7** - Primary tool for library documentation
2. **github** - View source and tests
3. **deepwiki** - High-level documentation

### For finding patterns/examples:
1. **Explore agent** - Search through multiple repos
2. **github search_code** - Find specific code patterns
3. **perplexity** - Find tutorials and explanations

### For complex research:
1. **General Purpose agent** - Multi-step research tasks
2. **perplexity deep_research** - Comprehensive analysis

## Recommended Workflow

### Phase 1: Understanding Dependencies
```
1. context7: resolve-library-id("stellar-sdk")
2. context7: get-library-docs(libraryId, mode="info")
3. github: get_file_contents("script3", "fee-vault-v2", "README.md")
4. github: get_file_contents("soroswap", "core", "README.md")
```

### Phase 2: Studying Integration Patterns
```
1. Explore agent: "Find how fee-vault-v2 handles deposits" (medium thoroughness)
2. github: get_file_contents("script3", "fee-vault-v2", "src/vault.rs")
3. deepwiki: ask_question("script3/fee-vault-v2", "What are the key integration points?")
```

### Phase 3: Implementing Features
```
1. context7: get-library-docs for API reference
2. github search_code: "soroban-sdk Map insert language:rust"
3. perplexity: search for specific error messages or patterns
```

### Phase 4: Problem Solving
```
1. perplexity: search("Soroban [specific error or pattern]")
2. Explore agent: "Find examples of [pattern] in soroban-examples"
3. General Purpose agent: "Research solutions for [complex problem]"
```

## Quick Reference

| Task | Primary Tool | Secondary Tool |
|------|-------------|----------------|
| Library documentation | context7 | github |
| Study fee-vault-v2 | github | deepwiki |
| Find code patterns | Explore agent | github search_code |
| Latest best practices | perplexity | WebSearch |
| Complex research | General Purpose agent | perplexity deep_research |
| Multi-file code search | Explore agent | - |
| Specific repo questions | deepwiki | github |
| Cloudflare deployment | cloudflare | - |

## Key Repos to Reference

- **stellar/js-stellar-sdk** - TypeScript SDK
- **stellar/soroban-examples** - Official examples
- **script3/fee-vault-v2** - Vault integration patterns
- **soroswap/core** - DEX integration
- **kalepail/soroban-fixed-point-math** - Safe math

## Notes

- Default to local tools (`rg`, `cargo test`, docs on disk) before escalating to agents; it keeps the fast feedback loop tight.
- Use Explore agent for multi-file searches (more efficient than manual)
- Use github search_code for finding specific patterns across repos
- Use perplexity for latest information and troubleshooting
- Use context7 for library documentation instead of reading raw source
- General Purpose agent can combine multiple tools automatically
- Use Bun for fast TypeScript tests (faster than Node.js)
- Regenerate TypeScript bindings after contract changes
- Use type-safe contract bindings instead of manual transaction building
- Cloudflare deployments: use `cloudflare` MCP tool for Workers/Pages docs
