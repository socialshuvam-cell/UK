<?php
namespace App\Core;

require_once dirname(__DIR__) . '/Vendor/fpdf/fpdf.php';

// Generic single-layout PDF renderer for every doc_type, driven entirely by
// the document's frozen data_snapshot + its document_templates.fields_config.
// Uses the vendored single-file FPDF library (pure PHP, no exec/system deps) —
// Hostinger shared-hosting safe. Never edit code to change a design; add a
// new document_templates row/version instead (fields_config: title, body_text
// with {{placeholders}}, show_photo/show_signatories flags, default_signatories).
final class DocumentRenderer
{
    public static function render(
        array $snapshot,
        string $qrAbsolutePath,
        string $verifyUrl,
        ?string $photoAbsolutePath,
        array $template,
        string $outputAbsolutePath
    ): void {
        $orientation = ($template['orientation'] ?? 'portrait') === 'landscape' ? 'L' : 'P';
        $paperSize = $template['paper_size'] ?? 'A4';
        $fieldsConfig = $template['fields_config'] ?? [];

        $pdf = new \FPDF($orientation, 'mm', $paperSize);
        $pdf->SetAutoPageBreak(true, 25);
        $pdf->AddPage();
        $pdf->SetMargins(12, 12, 12);

        $pageWidth = $pdf->GetPageWidth();
        $pageHeight = $pdf->GetPageHeight();

        $pdf->SetLineWidth(0.6);
        $pdf->Rect(6, 6, $pageWidth - 12, $pageHeight - 12);
        $pdf->SetLineWidth(0.2);

        $institutionName = $snapshot['institution']['name'] ?? 'Kingswell Institute';

        $pdf->SetY(14);
        $pdf->SetFont('Arial', 'B', 18);
        $pdf->Cell(0, 9, self::ascii($institutionName), 0, 1, 'C');

        $title = $fieldsConfig['title'] ?? self::defaultTitle($snapshot['doc_type']);
        $pdf->SetFont('Arial', 'B', 14);
        $pdf->Cell(0, 8, self::ascii($title), 0, 1, 'C');

        $pdf->SetFont('Arial', '', 9);
        $pdf->Cell(0, 6, 'Document No: ' . $snapshot['document_number'] . '   |   Issue Date: ' . $snapshot['issue_date'], 0, 1, 'C');
        $pdf->Ln(3);

        $showPhoto = $fieldsConfig['show_photo'] ?? true;
        $photoTop = $pdf->GetY();
        $photoEmbedded = false;
        if ($showPhoto && $photoAbsolutePath) {
            try {
                $pdf->Image($photoAbsolutePath, $pageWidth - 12 - 28, $photoTop, 26, 32);
                $photoEmbedded = true;
            } catch (\Throwable $e) {
                error_log('[DocumentRenderer] failed to embed candidate photo: ' . $e->getMessage());
            }
        }
        if ($showPhoto && !$photoEmbedded) {
            $pdf->Rect($pageWidth - 12 - 28, $photoTop, 26, 32);
            $pdf->SetFont('Arial', 'I', 7);
            $pdf->SetXY($pageWidth - 12 - 28, $photoTop + 14);
            $pdf->Cell(26, 4, 'No Photo', 0, 0, 'C');
        }

        $pdf->SetXY(14, $photoTop);
        foreach (self::infoLines($snapshot) as $label => $value) {
            $pdf->SetX(14);
            $pdf->SetFont('Arial', 'B', 10);
            $pdf->Cell(45, 6, $label . ':', 0, 0);
            $pdf->SetFont('Arial', '', 10);
            $pdf->Cell(0, 6, self::ascii((string) $value), 0, 1);
        }

        $bottomOfPhoto = $photoTop + 32;
        $pdf->SetY(max($pdf->GetY(), $bottomOfPhoto) + 4);

        self::renderBody($pdf, $snapshot, $fieldsConfig);

        $showSignatories = $fieldsConfig['show_signatories'] ?? true;
        $signatories = $snapshot['signatories'] ?? [];
        $bottomY = max($pageHeight - 55, $pdf->GetY() + 10);
        $pdf->SetY($bottomY);

        if ($showSignatories && $signatories) {
            $colWidth = ($pageWidth - 24 - 35) / max(count($signatories), 1);
            $x = 14;
            foreach ($signatories as $sig) {
                $pdf->SetXY($x, $bottomY + 12);
                $pdf->SetFont('Arial', '', 9);
                $pdf->Cell($colWidth - 6, 5, '____________________', 0, 1, 'C');
                $pdf->SetX($x);
                $pdf->SetFont('Arial', 'B', 9);
                $pdf->Cell($colWidth - 6, 5, self::ascii((string) ($sig['name'] ?? '')), 0, 1, 'C');
                $pdf->SetX($x);
                $pdf->SetFont('Arial', '', 8);
                $pdf->Cell($colWidth - 6, 5, self::ascii((string) ($sig['designation'] ?? '')), 0, 1, 'C');
                $x += $colWidth;
            }
        }

        $qrSize = 26;
        $pdf->Image($qrAbsolutePath, $pageWidth - 12 - $qrSize, $bottomY, $qrSize, $qrSize);
        $pdf->SetXY($pageWidth - 12 - $qrSize, $bottomY + $qrSize);
        $pdf->SetFont('Arial', '', 6.5);
        $pdf->Cell($qrSize, 3, 'Scan to verify', 0, 1, 'C');

        $pdf->SetAutoPageBreak(false);
        $pdf->SetY($pageHeight - 16);
        $pdf->SetFont('Arial', 'I', 7);
        $pdf->Cell(0, 4, 'This is a computer-generated document. Verify at: ' . $verifyUrl, 0, 0, 'C');

        $dir = dirname($outputAbsolutePath);
        if (!is_dir($dir) && !mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new \RuntimeException('Failed to prepare document output directory');
        }
        $pdf->Output('F', $outputAbsolutePath);
    }

    private static function infoLines(array $snapshot): array
    {
        $student = $snapshot['student'] ?? [];
        $extra = $snapshot['extra'] ?? [];
        $lines = ['Name' => trim(($student['first_name'] ?? '') . ' ' . ($student['last_name'] ?? ''))];

        if (!empty($student['registration_number'])) {
            $lines['Registration No.'] = $student['registration_number'];
        }
        if (!empty($extra['roll_number'])) {
            $lines['Roll No.'] = $extra['roll_number'];
        }
        if (!empty($snapshot['course']['name'])) {
            $lines['Course'] = $snapshot['course']['name'] . (!empty($snapshot['course']['code']) ? ' (' . $snapshot['course']['code'] . ')' : '');
        }
        if (!empty($snapshot['session']['name'])) {
            $lines['Session'] = $snapshot['session']['name'];
        }
        if (!empty($snapshot['institution']['name'])) {
            $lines['Institution'] = $snapshot['institution']['name'];
        }
        if (!empty($extra['examination']['name'])) {
            $lines['Examination'] = $extra['examination']['name'] . (!empty($extra['examination']['exam_code']) ? ' (' . $extra['examination']['exam_code'] . ')' : '');
        }
        if (!empty($extra['exam_center'])) {
            $lines['Exam Center'] = $extra['exam_center'];
        }
        if (!empty($extra['seat_number'])) {
            $lines['Seat No.'] = $extra['seat_number'];
        }
        if (!empty($extra['admission_number'])) {
            $lines['Admission No.'] = $extra['admission_number'];
        }

        return $lines;
    }

    private static function renderBody(\FPDF $pdf, array $snapshot, array $fieldsConfig): void
    {
        $extra = $snapshot['extra'] ?? [];
        switch ($snapshot['doc_type']) {
            case 'marksheet':
                self::subjectsTable($pdf, $extra['subjects'] ?? []);
                $pdf->Ln(2);
                $pdf->SetFont('Arial', 'B', 10);
                $pdf->Cell(0, 6, sprintf(
                    'Total: %s / %s   Percentage: %s%%   Grade: %s   Result: %s',
                    $extra['total_obtained_marks'] ?? '-',
                    $extra['total_max_marks'] ?? '-',
                    $extra['percentage'] ?? '-',
                    $extra['grade'] ?? '-',
                    strtoupper((string) ($extra['result_status'] ?? '-'))
                ), 0, 1);
                break;
            case 'transcript':
                self::examsTable($pdf, $extra['exams'] ?? []);
                $pdf->Ln(2);
                $pdf->SetFont('Arial', 'B', 10);
                $pdf->Cell(0, 6, 'Overall Percentage: ' . ($extra['overall_percentage'] ?? '-') . '%   Overall Grade: ' . ($extra['overall_grade'] ?? '-'), 0, 1);
                break;
            case 'hall_ticket':
                self::scheduleTable($pdf, $extra['subjects'] ?? []);
                break;
            default:
                $bodyText = self::substitute((string) ($fieldsConfig['body_text'] ?? ''), $snapshot);
                $pdf->SetFont('Arial', '', 11);
                $pdf->Ln(2);
                $pdf->MultiCell(0, 6.5, self::ascii($bodyText));
                if (!empty($extra['result'])) {
                    $pdf->Ln(2);
                    $pdf->SetFont('Arial', 'B', 10);
                    $pdf->Cell(0, 6, 'Result: ' . strtoupper((string) ($extra['result']['result_status'] ?? '-'))
                        . '   Percentage: ' . ($extra['result']['percentage'] ?? '-') . '%   Grade: ' . ($extra['result']['grade'] ?? '-'), 0, 1);
                }
        }
    }

    private static function subjectsTable(\FPDF $pdf, array $subjects): void
    {
        $widths = [30, 75, 25, 30, 25];
        self::tableHeader($pdf, $widths, ['Code', 'Subject', 'Max Marks', 'Obtained', 'Result']);
        $pdf->SetFont('Arial', '', 9);
        foreach ($subjects as $s) {
            $isAbsent = !empty($s['is_absent']);
            $obtained = $isAbsent ? 'Absent' : ($s['marks_obtained'] ?? '-');
            $passed = !$isAbsent && ((float) ($s['marks_obtained'] ?? 0) >= (float) ($s['pass_marks'] ?? 0));
            $pdf->Cell($widths[0], 7, self::ascii((string) ($s['subject_code'] ?? '')), 1);
            $pdf->Cell($widths[1], 7, self::ascii((string) ($s['subject_name'] ?? '')), 1);
            $pdf->Cell($widths[2], 7, (string) ($s['max_marks'] ?? ''), 1, 0, 'C');
            $pdf->Cell($widths[3], 7, (string) $obtained, 1, 0, 'C');
            $pdf->Cell($widths[4], 7, $passed ? 'Pass' : 'Fail', 1, 0, 'C');
            $pdf->Ln();
        }
    }

    private static function examsTable(\FPDF $pdf, array $exams): void
    {
        $widths = [35, 80, 30, 20, 20];
        self::tableHeader($pdf, $widths, ['Exam Code', 'Examination', 'Percentage', 'Grade', 'Result']);
        $pdf->SetFont('Arial', '', 9);
        foreach ($exams as $e) {
            $pdf->Cell($widths[0], 7, self::ascii((string) ($e['exam_code'] ?? '')), 1);
            $pdf->Cell($widths[1], 7, self::ascii((string) ($e['exam_name'] ?? '')), 1);
            $pdf->Cell($widths[2], 7, ($e['percentage'] ?? '-') . '%', 1, 0, 'C');
            $pdf->Cell($widths[3], 7, (string) ($e['grade'] ?? '-'), 1, 0, 'C');
            $pdf->Cell($widths[4], 7, strtoupper((string) ($e['result_status'] ?? '-')), 1, 0, 'C');
            $pdf->Ln();
        }
    }

    private static function scheduleTable(\FPDF $pdf, array $subjects): void
    {
        $widths = [30, 75, 30, 30, 20];
        self::tableHeader($pdf, $widths, ['Code', 'Subject', 'Date', 'Time', 'Duration']);
        $pdf->SetFont('Arial', '', 9);
        foreach ($subjects as $s) {
            $pdf->Cell($widths[0], 7, self::ascii((string) ($s['subject_code'] ?? '')), 1);
            $pdf->Cell($widths[1], 7, self::ascii((string) ($s['subject_name'] ?? '')), 1);
            $pdf->Cell($widths[2], 7, (string) ($s['exam_date'] ?? '-'), 1, 0, 'C');
            $pdf->Cell($widths[3], 7, (string) ($s['start_time'] ?? '-'), 1, 0, 'C');
            $pdf->Cell($widths[4], 7, ($s['duration_minutes'] ?? '-') . ' min', 1, 0, 'C');
            $pdf->Ln();
        }
    }

    private static function tableHeader(\FPDF $pdf, array $widths, array $headers): void
    {
        $pdf->SetFont('Arial', 'B', 9);
        foreach ($headers as $i => $h) {
            $pdf->Cell($widths[$i], 7, $h, 1, 0, 'C');
        }
        $pdf->Ln();
    }

    private static function substitute(string $text, array $snapshot): string
    {
        $student = $snapshot['student'] ?? [];
        $extra = $snapshot['extra'] ?? [];
        $map = [
            '{{student_name}}'         => trim(($student['first_name'] ?? '') . ' ' . ($student['last_name'] ?? '')),
            '{{registration_number}}'  => $student['registration_number'] ?? '',
            '{{roll_number}}'          => $extra['roll_number'] ?? '',
            '{{course_name}}'          => $snapshot['course']['name'] ?? '',
            '{{course_code}}'          => $snapshot['course']['code'] ?? '',
            '{{session_name}}'         => $snapshot['session']['name'] ?? '',
            '{{institution_name}}'     => $snapshot['institution']['name'] ?? 'Kingswell Institute',
            '{{admission_number}}'     => $extra['admission_number'] ?? '',
            '{{issue_date}}'           => $snapshot['issue_date'] ?? '',
            '{{document_number}}'      => $snapshot['document_number'] ?? '',
        ];
        return str_replace(array_keys($map), array_values($map), $text);
    }

    private static function defaultTitle(string $docType): string
    {
        return match ($docType) {
            'hall_ticket'        => 'EXAMINATION HALL TICKET',
            'marksheet'          => 'STATEMENT OF MARKS',
            'transcript'         => 'ACADEMIC TRANSCRIPT',
            'certificate'        => 'CERTIFICATE OF COMPLETION',
            'diploma'            => 'DIPLOMA',
            'degree'             => 'DEGREE CERTIFICATE',
            'completion_letter'  => 'COURSE COMPLETION LETTER',
            'admission_letter'   => 'ADMISSION LETTER',
            default              => strtoupper($docType),
        };
    }

    // FPDF core fonts only support Latin-1; transliterate to avoid garbled/broken output.
    private static function ascii(string $text): string
    {
        $converted = @iconv('UTF-8', 'ISO-8859-1//TRANSLIT', $text);
        return $converted !== false ? $converted : (string) preg_replace('/[^\x20-\x7E]/', '', $text);
    }
}
