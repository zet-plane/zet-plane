import { AnyErrorResponse } from "@zet-plane/contracts";
import type { z } from "zod";

export type EndpointDef = {
	method: string;
	path: string;
	params?: z.ZodType;
	query?: z.ZodType;
	request?: z.ZodType;
	response?: z.ZodType;
	errors: Record<number, z.ZodType>;
};

type EndpointResponse<T extends EndpointDef> = T extends { response: z.ZodType }
	? z.infer<T["response"]>
	: void;

export class ApiError<T extends EndpointDef> extends Error {
	status: number;
	body:
		| z.infer<T["errors"][keyof T["errors"]]>
		| z.infer<typeof AnyErrorResponse>;

	constructor(
		status: number,
		body:
			| z.infer<T["errors"][keyof T["errors"]]>
			| z.infer<typeof AnyErrorResponse>,
	) {
		super((body as { message?: string }).message ?? "API error");
		this.status = status;
		this.body = body;
	}
}

export async function apiCall<T extends EndpointDef>(
	endpoint: T,
	args: {
		params?: z.infer<NonNullable<T["params"]>>;
		query?: z.infer<NonNullable<T["query"]>>;
		body?: z.infer<NonNullable<T["request"]>>;
	} = {},
): Promise<EndpointResponse<T>> {
	const baseUrl =
		(import.meta.env?.VITE_API_BASE_URL as string | undefined) ?? "";
	const path =
		baseUrl +
		endpoint.path.replace(/:(\w+)/g, (_, k) =>
			String((args.params as Record<string, unknown>)?.[k]),
		);
	const url = appendQuery(path, args.query);
	const res = await fetch(url, {
		method: endpoint.method,
		headers: { "Content-Type": "application/json" },
		body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
	});
	const json = await readJsonBody(res);
	if (!res.ok) {
		const errSchema = endpoint.errors[res.status] ?? AnyErrorResponse;
		throw new ApiError(res.status, parseErrorBody(errSchema, json, res));
	}
	if (!endpoint.response) return undefined as EndpointResponse<T>;
	return endpoint.response.parse(json) as EndpointResponse<T>;
}

function appendQuery(path: string, query: unknown): string {
	if (query === undefined) return path;

	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
		if (value === undefined) continue;
		if (Array.isArray(value)) {
			for (const item of value) params.append(key, String(item));
			continue;
		}
		params.set(key, String(value));
	}

	const serialized = params.toString();
	return serialized.length > 0 ? `${path}?${serialized}` : path;
}

async function readJsonBody(res: Response): Promise<unknown> {
	if (res.status === 204) return undefined;

	const text = await res.text();
	if (text.length === 0) return undefined;

	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

function parseErrorBody(
	errSchema: z.ZodType,
	json: unknown,
	res: Response,
): z.infer<typeof AnyErrorResponse> {
	const declared = errSchema.safeParse(json);
	if (declared.success)
		return declared.data as z.infer<typeof AnyErrorResponse>;

	const generic = AnyErrorResponse.safeParse(json);
	if (generic.success) return generic.data;

	return {
		code: "HTTP_ERROR",
		message: res.statusText || `HTTP ${res.status}`,
		details: json,
	};
}
