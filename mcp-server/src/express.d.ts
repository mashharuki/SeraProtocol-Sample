declare module "express" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  interface Request extends IncomingMessage {
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
  }

  interface Response extends ServerResponse {
    json(body: unknown): this;
    status(code: number): this;
    set(field: string, value: string): this;
    send(body: string): this;
    headersSent: boolean;
  }

  type NextFunction = (err?: unknown) => void;
  type RequestHandler = (req: Request, res: Response, next?: NextFunction) => void;

  interface Application {
    use(handler: RequestHandler): this;
    use(path: string, handler: RequestHandler): this;
    get(path: string, handler: RequestHandler): this;
    post(path: string, handler: (req: Request, res: Response) => void | Promise<void>): this;
    delete(path: string, handler: (req: Request, res: Response) => void | Promise<void>): this;
    listen(port: number, callback?: () => void): unknown;
  }

  interface ExpressStatic {
    (): Application;
    json(): RequestHandler;
  }

  const express: ExpressStatic;
  export default express;
}
