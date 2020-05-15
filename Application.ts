import { serve, ServerRequest } from "./deps.ts";
import { Router, LifecycleHook } from "./Router.ts";
import { Context } from "./Context.ts";
import { ViewEngine } from "./ViewEngine.ts";
import { CookieStorage, MemoryCookieStorage } from "./CookieStorage.ts";
import { ClientError } from "./ClientError.ts";
import { CookieOptions } from "./utils/cookies.ts";

export class Application<
  S extends object = { [key: string]: any },
  R extends object = { [key: string]: any },
> extends Router<S, R> {
  public options: AppParameters;
  public data: S = {} as S;

  constructor(options: AppOptions) {
    super();
    this.onInit(this);
    const defs = {
      port: 3000,
      hostname: '0.0.0.0',
      cookieKey: "train.ticket",
      cookieStorage: new MemoryCookieStorage(),
      cookieOptions: { maxAge: 60 * 60 * 24 },
    };
    this.options = { ...defs, ...options };
  }

  public async run() {
    const s = serve({ port: this.options.port, hostname: this.options.hostname });
    console.log(`Serving on http://${this.options.hostname}:${this.options.port}/`);
    for await (const req of s) {
      this.handleRequest(req);
    }
  }

  private async runHook(ctx: Context<S, R>, lifecycle: LifecycleHook) {
    const result = await this.handle(ctx, lifecycle);
    if (
      result === undefined && lifecycle == "onHandle" && ctx.res.body === null
    ) {
      ctx.res
        .setBody(
          `Requested route ${ctx.req.original.method} ${ctx.req.original.url} not found!`,
        )
        .setStatus(404);
    } else if (result !== true && result !== undefined) {
      ctx.res.setBody(result);
    }
  }

  private async handleRequest(request: ServerRequest): Promise<void> {
    const ctx = new Context<S, R>(request, this);
    await this.runHook(ctx, "onRequest");
    await this.runHook(ctx, "preParsing");
    await ctx._init();
    await this.runHook(ctx, "preHandling");
    try {
      await this.runHook(ctx, "onHandle");
    } catch (e) {
      console.error(e);
      if (e instanceof ClientError) {
        ctx.res
          .setBody(e.message)
          .setStatus(e.statusCode);
      } else {
        ctx.res
          .setBody("Internal server error!")
          .setStatus(500);
      }
    }
    await this.runHook(ctx, "postHandling");
    await ctx.res._prepareResponse();
    await this.runHook(ctx, "preSending");
    await ctx._respond();
    await this.runHook(ctx, "postSending");
  }
}

interface AppParameters extends AppOptions {
  port: number;
  hostname: string;
  cookieStorage: CookieStorage;
  cookieKey: string;
  cookieOptions: CookieOptions;
}

export interface AppOptions {
  appRoot?: string;
  port?: number;
  hostname: string;
  viewEngine?: ViewEngine;
  cookieStorage?: CookieStorage;
  cookieKey?: string;
  cookieOptions?: CookieOptions;
}
