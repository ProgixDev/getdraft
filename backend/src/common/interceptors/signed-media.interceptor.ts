import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, from, mergeMap } from 'rxjs';
import { MediaUrlService } from '../media/media-url.service';

/**
 * Rewrites stored media URLs into signed ones on the way out.
 *
 * Deliberately global rather than per-endpoint. Media is returned by
 * profiles, discover, the map, posts, saved posts, matches, messages and
 * public profiles; wiring each one by hand guarantees that the one that gets
 * forgotten renders broken images, and that the next endpoint someone adds
 * forgets too. Signing at the single point every response already passes
 * through cannot be missed.
 *
 * Order-independent by construction: the walk recurses through whatever it is
 * handed, so it finds the same URLs whether TransformInterceptor has already
 * wrapped the body in { statusCode, data } or not. That avoids depending on
 * the relative ordering of useGlobalInterceptors and APP_INTERCEPTOR, which
 * is a subtlety no future reader should have to re-derive.
 */
@Injectable()
export class SignedMediaInterceptor implements NestInterceptor {
  constructor(private readonly media: MediaUrlService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (!this.media.enabled) return next.handle();

    // INBOUND. The client is handed signed URLs and hands them straight back
    // on the next save -- edit-profile loads photos[] and re-submits it
    // verbatim. Persisting a signed URL would store a token that expires,
    // and the photo would silently disappear a week later. Strip it back to
    // canonical form before anything reads the body.
    //
    // Interceptors run before pipes, so this happens ahead of validation and
    // ahead of every handler, which is why no service needs to know about it.
    const request = context.switchToHttp().getRequest();
    if (request?.body) this.normalizeInPlace(request.body, 0);

    return next.handle().pipe(
      mergeMap((body) => {
        if (body === undefined || body === null) return from([body]);
        return from(this.rewrite(body));
      }),
    );
  }

  private async rewrite(body: any): Promise<any> {
    const found: string[] = [];
    this.collect(body, found, 0);
    if (found.length === 0) return body;

    const signed = await this.media.signAll(found);
    if (signed.size === 0) return body;

    return this.apply(body, signed, 0);
  }

  /**
   * Rewrites signed URLs back to canonical form, in place.
   *
   * Mutation is deliberate here: the request body is owned by this request
   * alone, and replacing it wholesale would break Fastify's own reference to
   * it. The response side rebuilds instead, for the opposite reason.
   */
  private normalizeInPlace(node: any, depth: number): void {
    if (depth > 12 || node === null || typeof node !== 'object') return;

    if (Array.isArray(node)) {
      node.forEach((item, index) => {
        if (typeof item === 'string') {
          node[index] = this.media.normalizeForStorage(item);
        } else {
          this.normalizeInPlace(item, depth + 1);
        }
      });
      return;
    }

    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        node[key] = this.media.normalizeForStorage(value);
      } else {
        this.normalizeInPlace(value, depth + 1);
      }
    }
  }

  /**
   * Depth is bounded because a response can carry cycles (a match holding
   * both users, each holding the match). 12 is far deeper than any payload
   * this API returns and cheap insurance against a hang.
   */
  private collect(node: any, out: string[], depth: number): void {
    if (depth > 12 || node === null || node === undefined) return;

    if (typeof node === 'string') {
      if (this.media.parse(node)) out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) this.collect(item, out, depth + 1);
      return;
    }
    if (typeof node === 'object') {
      for (const value of Object.values(node)) {
        this.collect(value, out, depth + 1);
      }
    }
  }

  /**
   * Rebuilds rather than mutating: the handler's object may be a cached row
   * or a Prisma result shared elsewhere, and writing a short-lived token into
   * it would leak that token into whatever else holds the reference.
   */
  private apply(node: any, signed: Map<string, string>, depth: number): any {
    if (depth > 12 || node === null || node === undefined) return node;

    if (typeof node === 'string') return signed.get(node) ?? node;

    if (Array.isArray(node)) {
      return node.map((item) => this.apply(item, signed, depth + 1));
    }

    if (typeof node === 'object') {
      // Anything that is not a plain object (Date, Buffer, class instance)
      // is passed through untouched — rebuilding it would strip its type.
      const proto = Object.getPrototypeOf(node);
      if (proto !== Object.prototype && proto !== null) return node;

      const copy: Record<string, any> = {};
      for (const [key, value] of Object.entries(node)) {
        copy[key] = this.apply(value, signed, depth + 1);
      }
      return copy;
    }

    return node;
  }
}
