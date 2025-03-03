import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';
const PYTHON_API_URL = process.env.PYTHON_API_URL || '';
const API_KEY = process.env.API_KEY;

export async function POST(request: NextRequest) {
    // TODO: We need to limit the size of the file
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;

        if (!file) {
            return NextResponse.json(
                { error: 'No file provided' },
                { status: 400 }
            );
        }

        // Log API details

        // Forward the file to Python API
        const pythonFormData = new FormData();
        pythonFormData.append('file', file);
        console.log("url", `${PYTHON_API_URL}/convert-heic-to-pdf`);
        const response = await fetch(`${PYTHON_API_URL}/convert-heic-to-pdf`, {
            method: 'POST',
            body: pythonFormData,
            headers: {
                'X-API-Key': API_KEY || '',
                'Origin': 'https://heic2pdf.net',
                'Accept': 'application/pdf',
                'User-Agent': 'heic2pdf-frontend'
            },
        })
        if (response.status === 403) {
            return NextResponse.json(
                { 
                    error: 'Access denied',
                    details: 'API key verification failed'
                },
                { status: 403 }
            );
        }

        if (!response.ok) {
            return NextResponse.json(
                { 
                    error: 'Conversion failed',
                    status: response.status,
                },
                { status: response.status }
            );
        }
        // Return the PDF with proper headers
        const pdfBuffer = await response.arrayBuffer();
        return new NextResponse(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="${file.name.replace(/\.[^/.]+$/, '')}.pdf"`,
                'Cache-Control': 'no-cache',
                'Content-Length': pdfBuffer.byteLength.toString()
            }
        });
    } catch (error) {
        console.error('Conversion error:', error);
        return NextResponse.json(
            { 
                error: 'Internal server error',
                details: error instanceof Error ? error.message : String(error)
            },
            { status: 500 }
        );
    }
}