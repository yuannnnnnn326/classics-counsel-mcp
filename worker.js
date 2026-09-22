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
        time: new Date().toISOString(),
      });
    }

    if (!env.MCP_KEY) {
      return json({ error: "MCP_KEY is not configured" }, 500);
    }

    if (url.pathname === `/mcp/${env.MCP_KEY}`) {
      return handleMcp(request, env);
    }

    return json(
      {
        ok: true,
        service: "classics-counsel-mcp",
        message: "Use /health or the private MCP endpoint.",
      },
      200
    );
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
        protocolVersion:
          params.protocolVersion || "2025-06-18",
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: "classics-counsel-mcp",
          version: "0.1.0",
        },
        instructions:
          "Use this MCP to retrieve primary-source passages and historical context from the user's classical Chinese text library. Treat historical material as reference and analogy, not as proof that the user should make a particular decision. Distinguish the source text from interpretation, mention important differences between historical cases and the user's situation, and do not force a single conclusion.",
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
        result: toolError(
          error instanceof Error ? error.message : String(error)
        ),
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
        "List all enabled classical texts currently available in the library. Use this when the user asks what books or sources are available.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },

    {
      name: "get_book_info",
      description:
        "Get metadata about one classical text, including title, author, era, source, edition notes, description, and passage count.",
      inputSchema: {
        type: "object",
        properties: {
          book: {
            type: "string",
            description:
              "Book title or slug, for example 史记 or shiji.",
          },
        },
        required: ["book"],
        additionalProperties: false,
      },
    },

    {
      name: "search_passages",
      description:
        "Search across the classical text library for passages related to a word, phrase, person, event, chapter name, or topic. This is currently literal text search rather than semantic similarity search. The AI may try several concise related queries when one search is too narrow.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "A concise search term or phrase, such as 知人, 刘邦, 进退, 信, or a phrase from the text.",
          },
          book: {
            type: "string",
            description:
              "Optional book title or slug to restrict the search.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 10,
            default: 5,
            description:
              "Maximum number of matching passages to return.",
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },

    {
      name: "get_passage",
      description:
        "Retrieve one passage by ID together with nearby passages from the same book. Use this after search_passages when more context is needed before interpreting a source.",
      inputSchema: {
        type: "object",
        properties: {
          passage_id: {
            type: "integer",
            minimum: 1,
            description: "Passage ID returned by search_passages.",
          },
          context: {
            type: "integer",
            minimum: 0,
            maximum: 3,
            default: 1,
            description:
              "Number of nearby passages before and after the selected passage.",
          },
        },
        required: ["passage_id"],
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


async function listBooks(env) {
  const result = await env.DB.prepare(`
    SELECT
      b.id,
      b.slug,
      b.title,
      b.author,
      b.era,
      b.description,
      COUNT(p.id) AS passage_count
    FROM books b
    LEFT JOIN passages p
      ON p.book_id = b.id
    WHERE b.enabled = 1
    GROUP BY b.id
    ORDER BY b.id ASC
  `).all();

  return toolResult({
    count: result.results.length,
    books: result.results,
  });
}


async function getBookInfo(env, args) {
  const book = String(args.book || "").trim();

  if (!book) {
    return toolError("book cannot be empty");
  }

  const row = await env.DB.prepare(`
    SELECT
      b.id,
      b.slug,
      b.title,
      b.author,
      b.era,
      b.source_name,
      b.source_url,
      b.edition_note,
      b.description,
      b.enabled,
      COUNT(p.id) AS passage_count
    FROM books b
    LEFT JOIN passages p
      ON p.book_id = b.id
    WHERE
      b.slug = ?
      OR b.title = ?
    GROUP BY b.id
    LIMIT 1
  `)
    .bind(book, book)
    .first();

  if (!row) {
    return toolError(`Book not found: ${book}`);
  }

  return toolResult(row);
}


async function searchPassages(env, args) {
  const query = String(args.query || "").trim();
  const book = String(args.book || "").trim();
  const limit = Math.max(
    1,
    Math.min(10, Number(args.limit) || 5)
  );

  if (!query) {
    return toolError("query cannot be empty");
  }

  const pattern = `%${query}%`;

  let sql = `
    SELECT
      p.id AS passage_id,
      b.slug AS book_slug,
      b.title AS book_title,
      b.author,
      b.era,
      p.chapter,
      p.section,
      p.text,
      p.summary,
      p.sort_order
    FROM passages p
    JOIN books b
      ON b.id = p.book_id
    WHERE
      b.enabled = 1
      AND (
        p.text LIKE ?
        OR COALESCE(p.summary, '') LIKE ?
        OR COALESCE(p.chapter, '') LIKE ?
        OR COALESCE(p.section, '') LIKE ?
        OR b.title LIKE ?
      )
  `;

  const bindings = [
    pattern,
    pattern,
    pattern,
    pattern,
    pattern,
  ];

  if (book) {
    sql += `
      AND (
        b.slug = ?
        OR b.title = ?
      )
    `;

    bindings.push(book, book);
  }

  sql += `
    ORDER BY
      CASE
        WHEN p.text LIKE ? THEN 0
        WHEN COALESCE(p.chapter, '') LIKE ? THEN 1
        WHEN COALESCE(p.section, '') LIKE ? THEN 2
        WHEN COALESCE(p.summary, '') LIKE ? THEN 3
        ELSE 4
      END,
      b.id ASC,
      p.sort_order ASC
    LIMIT ?
  `;

  bindings.push(
    pattern,
    pattern,
    pattern,
    pattern,
    limit
  );

  const result = await env.DB.prepare(sql)
    .bind(...bindings)
    .all();

  return toolResult({
    query,
    book_filter: book || null,
    count: result.results.length,
    note:
      "This version uses literal text matching, not semantic similarity search.",
    results: result.results,
  });
}


async function getPassage(env, args) {
  const passageId = Number(args.passage_id);
  const context = Math.max(
    0,
    Math.min(3, Number(args.context) || 1)
  );

  if (
    !Number.isInteger(passageId) ||
    passageId < 1
  ) {
    return toolError("passage_id must be a positive integer");
  }

  const current = await env.DB.prepare(`
    SELECT
      p.id AS passage_id,
      p.book_id,
      b.slug AS book_slug,
      b.title AS book_title,
      b.author,
      b.era,
      b.source_name,
      b.source_url,
      p.chapter,
      p.section,
      p.text,
      p.summary,
      p.sort_order
    FROM passages p
    JOIN books b
      ON b.id = p.book_id
    WHERE p.id = ?
    LIMIT 1
  `)
    .bind(passageId)
    .first();

  if (!current) {
    return toolError(
      `Passage not found: ${passageId}`
    );
  }

  const before = await env.DB.prepare(`
    SELECT
      id AS passage_id,
      chapter,
      section,
      text,
      summary,
      sort_order
    FROM passages
    WHERE
      book_id = ?
      AND sort_order < ?
    ORDER BY sort_order DESC
    LIMIT ?
  `)
    .bind(
      current.book_id,
      current.sort_order,
      context
    )
    .all();

  const after = await env.DB.prepare(`
    SELECT
      id AS passage_id,
      chapter,
      section,
      text,
      summary,
      sort_order
    FROM passages
    WHERE
      book_id = ?
      AND sort_order > ?
    ORDER BY sort_order ASC
    LIMIT ?
  `)
    .bind(
      current.book_id,
      current.sort_order,
      context
    )
    .all();

  const beforeOrdered = [
    ...before.results,
  ].reverse();

  return toolResult({
    source: {
      book_slug: current.book_slug,
      book_title: current.book_title,
      author: current.author,
      era: current.era,
      source_name: current.source_name,
      source_url: current.source_url,
    },

    selected: {
      passage_id: current.passage_id,
      chapter: current.chapter,
      section: current.section,
      text: current.text,
      summary: current.summary,
      sort_order: current.sort_order,
    },

    context_before: beforeOrdered,
    context_after: after.results,
  });
}
