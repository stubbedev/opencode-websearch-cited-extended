import type { Auth as ProviderAuth } from "@opencode-ai/sdk";
import type { GetAuth, WebsearchClient } from "./types.ts";

type AnthropicWebSearchTool = {
	type: "web_search_20260209";
	name: "web_search";
	max_uses?: number;
};

type AnthropicTextBlock = {
	type: "text";
	text: string;
	citations?: AnthropicCitation[];
};

type AnthropicCitation = {
	type: "web_search_result_location";
	url?: string;
	title?: string;
	cited_text?: string;
};

type AnthropicContentBlock = AnthropicTextBlock | { type: string };

type AnthropicMessagesResponse = {
	content?: AnthropicContentBlock[];
};

type AnthropicRequestBody = {
	model: string;
	max_tokens: number;
	messages: AnthropicMessage[];
	tools: AnthropicWebSearchTool[];
};

type AnthropicMessage = {
	role: "user";
	content: string;
};

const ANTHROPIC_MESSAGES_ENDPOINT = "https://api.anthropic.com/v1/messages";

function getAccessToken(auth: ProviderAuth): string {
	if (auth.type === "oauth") {
		const token = auth.access.trim();
		if (!token) {
			throw new Error("Missing Anthropic OAuth access token");
		}
		return token;
	}

	if (auth.type === "api") {
		const key = auth.key.trim();
		if (!key) {
			throw new Error("Missing Anthropic API key");
		}
		return key;
	}

	const token = auth.token.trim();
	if (!token) {
		throw new Error("Missing Anthropic token");
	}
	return token;
}

function isOAuthAuth(auth: ProviderAuth): boolean {
	return auth.type === "oauth";
}

function formatAnthropicResponse(response: AnthropicMessagesResponse, query: string): string {
	const content = response.content;
	if (!content || content.length === 0) {
		return `No search results or information found for query: "${query}"`;
	}

	const sources = new Map<string, { url: string; title: string }>();
	let sourceIndex = 0;
	const urlToIndex = new Map<string, number>();

	let combined = "";

	for (const block of content) {
		if (block.type !== "text") {
			continue;
		}

		const textBlock = block as AnthropicTextBlock;
		const text = textBlock.text;
		const citations = textBlock.citations;

		if (!citations || citations.length === 0) {
			combined += text;
			continue;
		}

		let citationMarkers = "";
		for (const citation of citations) {
			if (!citation.url) {
				continue;
			}

			let idx = urlToIndex.get(citation.url);
			if (idx === undefined) {
				sourceIndex += 1;
				idx = sourceIndex;
				urlToIndex.set(citation.url, idx);
				sources.set(String(idx), { url: citation.url, title: citation.title ?? "Untitled" });
			}

			citationMarkers += `[${idx}]`;
		}

		combined += text + citationMarkers;
	}

	if (!combined.trim()) {
		return `No search results or information found for query: "${query}"`;
	}

	if (sources.size > 0) {
		const sourceLines = Array.from(sources.entries()).map(([idx, src]) => `[${idx}] ${src.title} (${src.url})`);
		combined += `\n\nSources:\n${sourceLines.join("\n")}`;
	}

	return combined;
}

async function runAnthropicWebSearch(options: {
	model: string;
	query: string;
	abortSignal: AbortSignal;
	auth: ProviderAuth;
}): Promise<string> {
	const normalizedModel = options.model.trim();
	if (!normalizedModel) {
		throw new Error("Invalid Anthropic web search model");
	}

	const normalizedQuery = options.query.trim();
	if (!normalizedQuery) {
		throw new Error("Query must not be empty");
	}

	const accessToken = getAccessToken(options.auth);
	const isOAuth = isOAuthAuth(options.auth);

	const body: AnthropicRequestBody = {
		model: normalizedModel,
		max_tokens: 4096,
		messages: [
			{
				role: "user",
				content: normalizedQuery,
			},
		],
		tools: [
			{
				type: "web_search_20260209",
				name: "web_search",
			},
		],
	};

	const headers: Record<string, string> = {
		"content-type": "application/json",
		"anthropic-version": "2023-06-01",
	};

	if (isOAuth) {
		headers.authorization = `Bearer ${accessToken}`;
	} else {
		headers["x-api-key"] = accessToken;
	}

	const response = await fetch(ANTHROPIC_MESSAGES_ENDPOINT, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
		signal: options.abortSignal,
	});

	if (!response.ok) {
		const text = await response.text().catch(() => "");
		const details = text.trim() !== "" ? ` | responseBody=${text}` : "";
		throw new Error(
			`status=${response.status} | url=${ANTHROPIC_MESSAGES_ENDPOINT} | requestBody=${JSON.stringify(body)}${details}`
		);
	}

	const payload = (await response.json()) as AnthropicMessagesResponse;
	return formatAnthropicResponse(payload, normalizedQuery);
}

export function createAnthropicWebsearchClient(model: string): WebsearchClient {
	const normalizedModel = model.trim();
	if (!normalizedModel) {
		throw new Error("Invalid Anthropic web search model");
	}

	return {
		async search(query, abortSignal, getAuth: GetAuth) {
			const normalizedQuery = query.trim();
			if (!normalizedQuery) {
				throw new Error("Query must not be empty");
			}

			const auth = await getAuth();
			if (!auth) {
				throw new Error('Missing auth for provider "anthropic"');
			}

			return runAnthropicWebSearch({
				model: normalizedModel,
				query: normalizedQuery,
				abortSignal,
				auth,
			});
		},
	};
}

export { formatAnthropicResponse };
