// Client-side diff engine — pure domain functions bundled by Vite
// No server needed: computeDiff and buildGuide are pure functions with zero I/O

import { computeDiff } from "@domain/diff-algorithm";
import { buildGuide } from "@domain/guide-builder";
import type {
  DiffResult,
  MigrationGuide,
} from "@domain/types";

export type { DiffResult, MigrationGuide };

export function runDiff(oldSpec: unknown, newSpec: unknown): DiffResult[] {
  return computeDiff(oldSpec, newSpec);
}

export function runGuide(
  oldSpec: unknown,
  newSpec: unknown,
  baseVersion: string,
  revisionVersion: string,
  sunsetDate?: string,
): MigrationGuide {
  const diffs = computeDiff(oldSpec, newSpec);
  return buildGuide(diffs, baseVersion, revisionVersion, sunsetDate);
}

export interface Sample {
  name: string;
  description: string;
  v1: unknown;
  v2: unknown;
}

// Samples are static — bundled into the client
export const SAMPLES: Sample[] = [
  {
    name: "Stripe Customer (v1 → v2)",
    description: "billing → collection_method rename, sources → payment_methods move, new invoice_settings",
    v1: {"id":"cus_NffrFeUfNV2Hib","object":"customer","billing":"charge_automatically","account_balance":0,"sources":{"object":"list","data":[],"has_more":false,"url":"/v1/customers/cus_NffrFeUfNV2Hib/sources"},"subscriptions":{"object":"list","data":[]},"created":1680893993,"email":"jenny@example.com","livemode":false,"metadata":{},"name":"Jenny Rosen","phone":null,"preferred_locales":[],"tax_exempt":"none"},
    v2: {"id":"cus_NffrFeUfNV2Hib","object":"customer","collection_method":"charge_automatically","balance":0,"payment_methods":{"object":"list","data":[],"has_more":false,"url":"/v1/customers/cus_NffrFeUfNV2Hib/payment_methods"},"subscriptions":{"object":"list","data":[]},"created":1680893993,"email":"jenny@example.com","livemode":false,"metadata":{},"name":"Jenny Rosen","phone":null,"preferred_locales":[],"tax_exempt":"none","invoice_settings":{"default_payment_method":null,"footer":null}},
  },
  {
    name: "Twilio Message (v1 → v2)",
    description: "price field type change (string → object), sid renamed, new subresource_uris",
    v1: {"sid":"SM123","account_sid":"AC456","from":"+15551234567","to":"+15559876543","body":"Hello!","status":"delivered","price":"-0.0075","price_unit":"USD","date_created":"2024-01-15T10:30:00Z","date_sent":"2024-01-15T10:30:01Z","error_code":null,"error_message":null,"num_segments":"1"},
    v2: {"message_sid":"SM123","account_sid":"AC456","from":"+15551234567","to":"+15559876543","body":"Hello!","status":"delivered","price":{"amount":-0.0075,"currency":"USD"},"date_created":"2024-01-15T10:30:00Z","date_sent":"2024-01-15T10:30:01Z","error_code":null,"error_message":null,"num_segments":1,"subresource_uris":{"media":"/2010-04-01/Accounts/AC456/Messages/SM123/Media.json"}},
  },
  {
    name: "GitHub User (v3 → v4 style)",
    description: "Nested fields restructured, new node_id, removed gravatar_id",
    v1: {"login":"octocat","id":1,"gravatar_id":"somehash","url":"https://api.github.com/users/octocat","type":"User","site_admin":false,"name":"The Octocat","company":"GitHub","blog":"https://github.blog","location":"San Francisco","email":"octocat@github.com","bio":"A cat that codes","public_repos":8,"followers":1000,"following":0,"created_at":"2008-01-14T04:33:35Z"},
    v2: {"login":"octocat","id":1,"node_id":"MDQ6VXNlcjE=","url":"https://api.github.com/users/octocat","type":"User","site_admin":false,"name":"The Octocat","company":"GitHub","blog":"https://github.blog","location":"San Francisco","email":"octocat@github.com","bio":"A cat that codes","public_repos":8,"followers":1000,"following":0,"created_at":"2008-01-14T04:33:35Z","twitter_username":"octocat"},
  },
];
