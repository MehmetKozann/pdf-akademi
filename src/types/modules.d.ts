declare module "pdf-parse/lib/pdf-parse.js" {
  interface PdfParseOutput {
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: Record<string, unknown>;
    text: string;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfParseOutput>;
  export default pdfParse;
}

declare module "mammoth" {
  export interface MammothResult {
    value: string;
    messages: unknown[];
  }
  export function extractRawText(options: { buffer: Buffer }): Promise<MammothResult>;
}
