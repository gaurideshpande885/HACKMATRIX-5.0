package com.ctrlaltelite.fin;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import com.tom_roush.pdfbox.pdmodel.PDDocument;
import com.tom_roush.pdfbox.text.PDFTextStripper;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

final class PdfStatementExtractor {
    private static final int MAX_FILE_BYTES = 12 * 1024 * 1024;
    private static final int MAX_PAGES = 120;
    private static final int MAX_TEXT_CHARS = 1_500_000;

    static final class Result {
        final String fileName;
        final String text;
        final String alternateText;
        final int pages;
        final int fileBytes;

        Result(String fileName, String text, String alternateText, int pages, int fileBytes) {
            this.fileName = fileName;
            this.text = text;
            this.alternateText = alternateText;
            this.pages = pages;
            this.fileBytes = fileBytes;
        }
    }

    private PdfStatementExtractor() {}

    static Result extract(ContentResolver resolver, Uri uri, String password) throws IOException {
        String fileName = displayName(resolver, uri);
        byte[] bytes;
        try (InputStream input = resolver.openInputStream(uri)) {
            if (input == null) throw new IOException("The selected PDF could not be opened");
            bytes = readBounded(input);
        }

        try (PDDocument document = PDDocument.load(bytes, password == null ? "" : password)) {
            int pages = document.getNumberOfPages();
            if (pages < 1) throw new IOException("The PDF has no pages");
            if (pages > MAX_PAGES) throw new IOException("PDF statements are limited to 120 pages");

            String extracted = extractText(document, pages, true);
            if (extracted.length() < 80) {
                throw new IOException("No usable text was found. Scanned-image PDFs need OCR before import");
            }
            String fingerprint = extracted.replaceAll("\\s+", "").toLowerCase(Locale.US);
            boolean googlePay = fingerprint.contains("transactionstatement") && fingerprint.contains("upitransactionid");
            String alternate = googlePay ? extractText(document, pages, false) : "";
            if (alternate.equals(extracted)) alternate = "";
            return new Result(fileName, extracted, alternate, pages, bytes.length);
        }
    }

    private static String extractText(PDDocument document, int pages, boolean sortByPosition) throws IOException {
        PDFTextStripper stripper = new PDFTextStripper();
        stripper.setSortByPosition(sortByPosition);
        StringBuilder text = new StringBuilder(Math.min(MAX_TEXT_CHARS, pages * 4000));
        for (int page = 1; page <= pages; page++) {
            stripper.setStartPage(page);
            stripper.setEndPage(page);
            text.append(stripper.getText(document)).append('\n');
            if (text.length() > MAX_TEXT_CHARS) {
                throw new IOException("The extracted statement text exceeds the 1.5 MB safety limit");
            }
        }
        return text.toString().trim();
    }

    static String displayName(ContentResolver resolver, Uri uri) {
        try (Cursor cursor = resolver.query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                String name = cursor.getString(0);
                if (name != null && !name.trim().isEmpty()) return name.trim();
            }
        } catch (Exception ignored) {
            // Fall back to the last URI segment when a document provider has no display-name column.
        }
        String fallback = uri.getLastPathSegment();
        return fallback == null || fallback.trim().isEmpty() ? "statement.pdf" : fallback;
    }

    static boolean isPdf(ContentResolver resolver, Uri uri) {
        String type = resolver.getType(uri);
        if ("application/pdf".equalsIgnoreCase(type)) return true;
        return displayName(resolver, uri).toLowerCase(Locale.US).endsWith(".pdf");
    }

    private static byte[] readBounded(InputStream input) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[16 * 1024];
        int total = 0;
        int count;
        while ((count = input.read(buffer)) != -1) {
            total += count;
            if (total > MAX_FILE_BYTES) throw new IOException("PDF statements are limited to 12 MB");
            output.write(buffer, 0, count);
        }
        return output.toByteArray();
    }
}
