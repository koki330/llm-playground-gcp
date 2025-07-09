import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

/**
 * Parses a file buffer and extracts text content based on its MIME type.
 * @param fileBuffer The file content as a Buffer.
 * @param contentType The MIME type of the file.
 * @returns A promise that resolves with the extracted text content.
 */
export async function parseFileContent(fileBuffer: Buffer, contentType: string): Promise<string> {
  console.log(`Parsing file with content type: ${contentType}`);
  switch (contentType) {
    case 'application/pdf':
      const pdfData = await pdf(fileBuffer);
      return pdfData.text;

    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': // .docx
      const docxResult = await mammoth.extractRawText({ buffer: fileBuffer });
      return docxResult.value;

    case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': // .xlsx
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      let fullText = '';
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const sheetText = XLSX.utils.sheet_to_csv(sheet);
        fullText += `--- Sheet: ${sheetName} ---
${sheetText}

`;
      });
      return fullText;
      
    case 'text/plain':
    case 'text/markdown':
    case 'application/json':
      // Assuming UTF-8. The original project had more complex encoding detection.
      // This can be added back if required.
      return fileBuffer.toString('utf-8');

    default:
      console.warn(`Unsupported file type for direct parsing: ${contentType}. Returning empty string.`);
      // Instead of throwing an error, we can return a message or empty string
      // to avoid breaking the flow for image files, which are handled differently.
      return '';
  }
}
