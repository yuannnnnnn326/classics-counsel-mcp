const USER_AGENT = "classics-counsel-mcp";

const textCache = new Map();
let libraryCache = {
  key: null,
  at: 0,
  files: null,
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "classics-counsel-mcp",
        version: "1.0.0",
        source: "github-txt-library",
        github_configured: Boolean(
          String(env.GITHUB_OWNER || "").trim() &&
            String(env.GITHUB_REPO || "").trim()
        ),
        time: new Date().toISOString(),
      });
    }

    if (!env.MCP_KEY) {
      return json({ error: "MCP_KEY is not configured" }, 500);
    }

    if (url.pathname === `/mcp/${env.MCP_KEY}`) {
      return handleMcp(request, env);
    }

    return json({
      ok: true,
      service: "classics-counsel-mcp",
      message: "Use /health or the private MCP endpoint.",
    });
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
    },
  });
}

function toolResult(data) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function toolError(message) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: String(message),
      },
    ],
  };
}

function getConfig(env) {
  const owner = String(env.GITHUB_OWNER || "").trim();
  const repo = String(env.GITHUB_REPO || "").trim();
  const branch = String(env.GITHUB_BRANCH || "main").trim() || "main";
  const libraryPath = String(env.LIBRARY_PATH || "library").trim() || "library";

  if (!owner || !repo) {
    throw new Error(
      "GITHUB_OWNER and GITHUB_REPO must be configured as Cloudflare Worker environment variables."
    );
  }

  return { owner, repo, branch, libraryPath };
}

function encodedPath(path) {
  return String(path || "")
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function githubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": USER_AGENT,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function handleMcp(request, env) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders(),
    });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error",
        },
      },
      400
    );
  }

  const id = body.id ?? null;
  const method = body.method;
  const params = body.params ?? {};

  if (method === "initialize") {
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params.protocolVersion || "2025-06-18",
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: "classics-counsel-mcp",
          version: "1.0.0",
        },
        instructions:
          "Use this MCP as a classical Chinese primary-source library for reflection and decision support. " +
          "When the user is uncertain or asks for guidance, search for concrete historical cases and original passages that illuminate the situation. " +
          "When the library genuinely supports different approaches, prefer presenting at least two contrasting cases or perspectives rather than forcing one ancient answer. " +
          "Clearly distinguish original text, historical outcome, and modern interpretation. " +
          "Explain important differences between the historical case and the user's situation, then give a practical contextual recommendation. " +
          "Do not invent passages or claim a source says something it does not. " +
          "Search is literal full-text search, so try several short related queries when an abstract question has no direct hit. " +
          "When the user explicitly asks about all existing texts, the whole library, or requests comparison across the library, do not stop after finding a few good examples: search the full library first, inspect per-book coverage, and only then select the most relevant contrasting cases.",
      },
    });
  }

  if (method === "notifications/initialized") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (method === "ping") {
    return json({
      jsonrpc: "2.0",
      id,
      result: {},
    });
  }

  if (method === "tools/list") {
    return json({
      jsonrpc: "2.0",
      id,
      result: {
        tools: toolDefinitions(),
      },
    });
  }

  if (method === "tools/call") {
    const name = params.name;
    const args = params.arguments ?? {};

    try {
      const result = await callTool(name, args, env);
      return json({
        jsonrpc: "2.0",
        id,
        result,
      });
    } catch (error) {
      return json({
        jsonrpc: "2.0",
        id,
        result: toolError(error instanceof Error ? error.message : String(error)),
      });
    }
  }

  return json({
    jsonrpc: "2.0",
    id,
    error: {
      code: -32601,
      message: `Method not found: ${method}`,
    },
  });
}

function toolDefinitions() {
  return [
    {
      name: "list_books",
      description:
        "List all .txt classical texts currently present in the configured GitHub library folder. Newly uploaded .txt books appear automatically without code changes.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "get_book_info",
      description:
        "Get file-level information for one classical text in the library, including title, filename, size, repository path, and source link.",
      inputSchema: {
        type: "object",
        properties: {
          book: {
            type: "string",
            description:
              "Exact book title or filename from list_books, for example 史記 or 史記.txt.",
          },
        },
        required: ["book"],
        additionalProperties: false,
      },
    },
    {
      name: "search_passages",
      description:
        "Search exact words or phrases across the classical-text library. When no book is specified, this tool MUST search every current .txt book before selecting results. It returns per-book coverage, one representative result from each book that matched, and additional top results. For abstract real-life questions, try several concise related queries and compare contrasting cases instead of stopping after the first useful examples.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "A concise word or exact phrase to find in the primary text, such as 劉邦, 項羽, 信, 疑, 進退, or a known phrase.",
          },
          book: {
            type: "string",
            description:
              "Optional exact book title or filename from list_books. Omit to search all books.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 10,
            default: 5,
            description: "Maximum number of additional top matches to return.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      name: "get_passage",
      description:
        "Expand one search result using its passage_ref and return the exact source paragraph plus nearby paragraphs from the same book.",
      inputSchema: {
        type: "object",
        properties: {
          passage_ref: {
            type: "string",
            description: "Stable passage_ref returned by search_passages.",
          },
          context: {
            type: "integer",
            minimum: 0,
            maximum: 3,
            default: 1,
            description: "Number of neighboring paragraphs before and after.",
          },
        },
        required: ["passage_ref"],
        additionalProperties: false,
      },
    },
  ];
}

async function callTool(name, args, env) {
  switch (name) {
    case "list_books":
      return listBooks(env);
    case "get_book_info":
      return getBookInfo(env, args);
    case "search_passages":
      return searchPassages(env, args);
    case "get_passage":
      return getPassage(env, args);
    default:
      return toolError(`Unknown tool: ${name}`);
  }
}

async function getLibraryFiles(env) {
  const config = getConfig(env);
  const cacheKey = `${config.owner}/${config.repo}@${config.branch}:${config.libraryPath}`;
  const now = Date.now();

  if (
    libraryCache.files &&
    libraryCache.key === cacheKey &&
    now - libraryCache.at < 60_000
  ) {
    return libraryCache.files;
  }

  const apiUrl =
    `https://api.github.com/repos/${encodeURIComponent(config.owner)}/` +
    `${encodeURIComponent(config.repo)}/contents/${encodedPath(config.libraryPath)}` +
    `?ref=${encodeURIComponent(config.branch)}`;

  const response = await fetch(apiUrl, {
    headers: githubHeaders(),
    cf: {
      cacheTtl: 60,
      cacheEverything: true,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Could not read GitHub library (${response.status}). Check GITHUB_OWNER, GITHUB_REPO, GITHUB_BRANCH and LIBRARY_PATH.`
    );
  }

  const data = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("GitHub library response was not a directory listing.");
  }

  const files = data
    .filter(
      (item) =>
        item &&
        item.type === "file" &&
        typeof item.name === "string" &&
        item.name.toLowerCase().endsWith(".txt") &&
        !item.name.startsWith(".")
    )
    .map((item) => ({
      title: item.name.replace(/\.txt$/i, ""),
      filename: item.name,
      path: item.path,
      size_bytes: item.size,
      sha: item.sha,
      html_url: item.html_url,
      download_url: item.download_url,
    }))
    .sort((a, b) => a.filename.localeCompare(b.filename, "zh-Hant"));

  libraryCache = {
    key: cacheKey,
    at: now,
    files,
  };

  return files;
}

function normalizeBookName(value) {
  return String(value || "")
    .trim()
    .replace(/\.txt$/i, "")
    .replace(/[《》〈〉\s]/g, "")
    .toLowerCase();
}

async function findBook(env, bookInput) {
  const files = await getLibraryFiles(env);
  const key = normalizeBookName(bookInput);

  if (!key) return null;

  return (
    files.find((f) => normalizeBookName(f.filename) === key) ||
    files.find((f) => normalizeBookName(f.title) === key) ||
    null
  );
}

async function listBooks(env) {
  const files = await getLibraryFiles(env);

  return toolResult({
    count: files.length,
    source: "GitHub library/*.txt",
    books: files.map((f) => ({
      title: f.title,
      filename: f.filename,
      size_bytes: f.size_bytes,
      path: f.path,
    })),
    note:
      "Upload another UTF-8 .txt file into the configured library folder and it will appear automatically. Directory listings may be cached for up to about 60 seconds.",
  });
}

async function getBookInfo(env, args) {
  const book = String(args.book || "").trim();
  if (!book) return toolError("book cannot be empty");

  const file = await findBook(env, book);
  if (!file) return toolError(`Book not found: ${book}`);

  return toolResult({
    title: file.title,
    filename: file.filename,
    size_bytes: file.size_bytes,
    path: file.path,
    source: "GitHub TXT library",
    source_url: file.html_url,
    storage_note:
      "The file is read directly from the configured GitHub repository. No D1 passage database is required.",
  });
}

async function loadBookText(file) {
  const cacheKey = `${file.sha}:${file.filename}`;
  if (textCache.has(cacheKey)) return textCache.get(cacheKey);

  if (!file.download_url) {
    throw new Error(`No raw download URL for ${file.filename}`);
  }

  const response = await fetch(file.download_url, {
    headers: {
      "User-Agent": USER_AGENT,
    },
    cf: {
      cacheTtl: 300,
      cacheEverything: true,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Could not download ${file.filename} from GitHub (${response.status}).`
    );
  }

  const text = await response.text();

  if (textCache.size >= 6) {
    const firstKey = textCache.keys().next().value;
    if (firstKey) textCache.delete(firstKey);
  }

  textCache.set(cacheKey, text);
  return text;
}

function splitIntoParagraphs(text) {
  const normalized = String(text || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!normalized) return [];

  const rough = normalized
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const paragraphs = [];

  for (const block of rough) {
    if (block.length <= 7000) {
      paragraphs.push(block);
      continue;
    }

    const lines = block
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (lines.length > 1) paragraphs.push(...lines);
    else paragraphs.push(block);
  }

  return paragraphs;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;

  let count = 0;
  let pos = 0;

  while (true) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    count += 1;
    pos = idx + Math.max(1, needle.length);
  }

  return count;
}

function makeExcerpt(text, query, maxChars = 1400) {
  if (text.length <= maxChars) {
    return {
      text,
      truncated: false,
    };
  }

  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const hit = lower.indexOf(q);
  const center = hit >= 0 ? hit + Math.floor(q.length / 2) : 0;
  const half = Math.floor(maxChars / 2);

  let start = Math.max(0, center - half);
  let end = Math.min(text.length, start + maxChars);

  if (end - start < maxChars) {
    start = Math.max(0, end - maxChars);
  }

  return {
    text:
      `${start > 0 ? "…" : ""}` +
      text.slice(start, end) +
      `${end < text.length ? "…" : ""}`,
    truncated: true,
  };
}

function makePassageRef(filename, paragraphIndex) {
  return `${encodeURIComponent(filename)}::${paragraphIndex}`;
}

function parsePassageRef(ref) {
  const raw = String(ref || "");
  const marker = raw.lastIndexOf("::");

  if (marker <= 0) return null;

  let filename;
  try {
    filename = decodeURIComponent(raw.slice(0, marker));
  } catch {
    return null;
  }

  const paragraphIndex = Number(raw.slice(marker + 2));
  if (!Number.isInteger(paragraphIndex) || paragraphIndex < 0) return null;

  return { filename, paragraphIndex };
}

async function searchPassages(env, args) {
  const query = String(args.query || "").trim();
  const book = String(args.book || "").trim();
  const limit = Math.max(1, Math.min(10, Number(args.limit) || 5));

  if (!query) return toolError("query cannot be empty");

  let files;

  if (book) {
    const file = await findBook(env, book);
    if (!file) return toolError(`Book not found: ${book}`);
    files = [file];
  } else {
    files = await getLibraryFiles(env);
  }

  if (files.length === 0) {
    return toolResult({
      query,
      book_filter: book || null,
      books_searched: 0,
      coverage: [],
      representative_results: [],
      top_results: [],
      note: "No .txt books are currently present in the configured library folder.",
    });
  }

  const qLower = query.toLowerCase();
  const allMatches = [];
  const coverage = [];
  const representativeResults = [];

  for (const file of files) {
    const text = await loadBookText(file);
    const paragraphs = splitIntoParagraphs(text);
    const bookMatches = [];

    for (let i = 0; i < paragraphs.length; i += 1) {
      const paragraph = paragraphs[i];
      const pLower = paragraph.toLowerCase();

      if (!pLower.includes(qLower)) continue;

      const excerpt = makeExcerpt(paragraph, query);
      const match = {
        passage_ref: makePassageRef(file.filename, i),
        book_title: file.title,
        filename: file.filename,
        paragraph_index: i,
        occurrences: countOccurrences(pLower, qLower),
        excerpt: excerpt.text,
        excerpt_truncated: excerpt.truncated,
        source_url: file.html_url,
      };

      bookMatches.push(match);
      allMatches.push(match);
    }

    bookMatches.sort((a, b) => {
      if (b.occurrences !== a.occurrences) {
        return b.occurrences - a.occurrences;
      }
      return a.paragraph_index - b.paragraph_index;
    });

    coverage.push({
      book_title: file.title,
      filename: file.filename,
      matches_found: bookMatches.length,
      searched: true,
    });

    if (bookMatches.length > 0) {
      representativeResults.push(bookMatches[0]);
    }
  }

  allMatches.sort((a, b) => {
    if (b.occurrences !== a.occurrences) {
      return b.occurrences - a.occurrences;
    }

    if (a.book_title !== b.book_title) {
      return a.book_title.localeCompare(b.book_title, "zh-Hant");
    }

    return a.paragraph_index - b.paragraph_index;
  });

  const representativeRefs = new Set(
    representativeResults.map((item) => item.passage_ref)
  );

  const additionalTopResults = allMatches
    .filter((item) => !representativeRefs.has(item.passage_ref))
    .slice(0, limit);

  return toolResult({
    query,
    book_filter: book || null,
    books_searched: files.length,
    books_with_matches: coverage.filter((item) => item.matches_found > 0).length,
    total_matches_found: allMatches.length,
    search_mode: book
      ? "literal full-text search in one book"
      : "literal full-text search with full-library coverage",
    coverage,
    representative_results: representativeResults,
    top_results: additionalTopResults,
    note: book
      ? "The specified book was searched in full. Use get_passage on promising results before interpreting them."
      : "Every current .txt book was searched before results were selected. representative_results contains up to one representative hit from each book with matches; top_results contains additional high-ranking hits. Do not infer that a book lacks relevant material unless coverage shows zero matches for the exact query. For abstract questions, try several short related queries before comparing cases.",
  });
}

function clippedExact(text, maxChars) {
  if (text.length <= maxChars) {
    return {
      text,
      truncated: false,
    };
  }

  return {
    text: `${text.slice(0, maxChars)}…`,
    truncated: true,
  };
}

async function getPassage(env, args) {
  const parsed = parsePassageRef(args.passage_ref);
  const context = Math.max(0, Math.min(3, Number(args.context) || 1));

  if (!parsed) {
    return toolError(
      "Invalid passage_ref. Use the value returned by search_passages."
    );
  }

  const files = await getLibraryFiles(env);
  const file = files.find((f) => f.filename === parsed.filename);

  if (!file) {
    return toolError(`Book file no longer exists: ${parsed.filename}`);
  }

  const text = await loadBookText(file);
  const paragraphs = splitIntoParagraphs(text);
  const i = parsed.paragraphIndex;

  if (i >= paragraphs.length) {
    return toolError(
      "This passage_ref is no longer valid because the source file changed. Search again."
    );
  }

  const selected = clippedExact(paragraphs[i], 7000);
  const before = [];
  const after = [];

  for (let n = Math.max(0, i - context); n < i; n += 1) {
    const item = clippedExact(paragraphs[n], 3000);
    before.push({
      passage_ref: makePassageRef(file.filename, n),
      paragraph_index: n,
      text: item.text,
      truncated: item.truncated,
    });
  }

  for (
    let n = i + 1;
    n <= Math.min(paragraphs.length - 1, i + context);
    n += 1
  ) {
    const item = clippedExact(paragraphs[n], 3000);
    after.push({
      passage_ref: makePassageRef(file.filename, n),
      paragraph_index: n,
      text: item.text,
      truncated: item.truncated,
    });
  }

  return toolResult({
    source: {
      book_title: file.title,
      filename: file.filename,
      source_url: file.html_url,
      storage: "GitHub TXT library",
    },
    selected: {
      passage_ref: makePassageRef(file.filename, i),
      paragraph_index: i,
      text: selected.text,
      truncated: selected.truncated,
    },
    context_before: before,
    context_after: after,
    note:
      "Returned text is copied from the uploaded TXT. Ellipses only indicate length truncation in the tool response.",
  });
}
