// heic-convert ships no types. This matches its real signature — verified
// against its own source (node_modules/.pnpm/heic-convert@*/node_modules/
// heic-convert/lib.js): the default export is `one`, an async function
// that decodes one HEIC/HEIF image and encodes it to the target format.
declare module 'heic-convert' {
  interface ConvertOptions {
    buffer: Buffer;
    format: 'JPEG' | 'PNG';
    quality?: number;
  }

  function convert(options: ConvertOptions): Promise<Uint8Array>;

  export default convert;
}
