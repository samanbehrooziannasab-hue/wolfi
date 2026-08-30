/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as adminActions from "../adminActions.js";
import type * as aiChat from "../aiChat.js";
import type * as aiMonitor from "../aiMonitor.js";
import type * as aiPolicy from "../aiPolicy.js";
import type * as aiProviders from "../aiProviders.js";
import type * as auth from "../auth.js";
import type * as auth_emailOtp from "../auth/emailOtp.js";
import type * as broker from "../broker.js";
import type * as brokerData from "../brokerData.js";
import type * as capital from "../capital.js";
import type * as chartImage from "../chartImage.js";
import type * as coins from "../coins.js";
import type * as constants from "../constants.js";
import type * as crons from "../crons.js";
import type * as crypto from "../crypto.js";
import type * as dashboard from "../dashboard.js";
import type * as engineCore from "../engineCore.js";
import type * as engineData from "../engineData.js";
import type * as engineEval from "../engineEval.js";
import type * as enginePortfolio from "../enginePortfolio.js";
import type * as engineWorker from "../engineWorker.js";
import type * as http from "../http.js";
import type * as learning from "../learning.js";
import type * as logs from "../logs.js";
import type * as markets from "../markets.js";
import type * as me from "../me.js";
import type * as monitor from "../monitor.js";
import type * as nodeCalls from "../nodeCalls.js";
import type * as notify from "../notify.js";
import type * as riskAdvisor from "../riskAdvisor.js";
import type * as settings from "../settings.js";
import type * as strategies from "../strategies.js";
import type * as strategyData from "../strategyData.js";
import type * as strategyPresets from "../strategyPresets.js";
import type * as swapwallet from "../swapwallet.js";
import type * as telegram from "../telegram.js";
import type * as users from "../users.js";
import type * as wolfAuth from "../wolfAuth.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  adminActions: typeof adminActions;
  aiChat: typeof aiChat;
  aiMonitor: typeof aiMonitor;
  aiPolicy: typeof aiPolicy;
  aiProviders: typeof aiProviders;
  auth: typeof auth;
  "auth/emailOtp": typeof auth_emailOtp;
  broker: typeof broker;
  brokerData: typeof brokerData;
  capital: typeof capital;
  chartImage: typeof chartImage;
  coins: typeof coins;
  constants: typeof constants;
  crons: typeof crons;
  crypto: typeof crypto;
  dashboard: typeof dashboard;
  engineCore: typeof engineCore;
  engineData: typeof engineData;
  engineEval: typeof engineEval;
  enginePortfolio: typeof enginePortfolio;
  engineWorker: typeof engineWorker;
  http: typeof http;
  learning: typeof learning;
  logs: typeof logs;
  markets: typeof markets;
  me: typeof me;
  monitor: typeof monitor;
  nodeCalls: typeof nodeCalls;
  notify: typeof notify;
  riskAdvisor: typeof riskAdvisor;
  settings: typeof settings;
  strategies: typeof strategies;
  strategyData: typeof strategyData;
  strategyPresets: typeof strategyPresets;
  swapwallet: typeof swapwallet;
  telegram: typeof telegram;
  users: typeof users;
  wolfAuth: typeof wolfAuth;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
