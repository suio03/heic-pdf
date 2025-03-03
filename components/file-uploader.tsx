'use client'
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { X, Upload, Download, ChevronLeft, ChevronRight } from "lucide-react"
import { toast } from 'react-hot-toast'
import JSZip from 'jszip'
import { useTranslations } from "next-intl"

interface FileItem {
    id: string
    file: File
    preview: string
    pdfUrl: string | null
    status: 'pending' | 'converting' | 'done' | 'error'
    convertedData: string | null
    convertedBlob: Blob | null
    convertedFileName: string | null
    error: string | null
}

interface ConversionResult {
    success: boolean;
    message: string;
    data: {
        filename: string;
        content_type: string;
        base64_data: string;
    };
}

const FileUploader = () => {
    const t = useTranslations('input')
    const [files, setFiles] = useState<FileItem[]>([])
    const [isDragging, setIsDragging] = useState(false)
    const [showLeftArrow, setShowLeftArrow] = useState(false)
    const [showRightArrow, setShowRightArrow] = useState(false)

    const scrollContainerRef = useRef<HTMLDivElement>(null)

    const checkScrollButtons = useCallback(() => {
        if (scrollContainerRef.current) {
            const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current
            setShowLeftArrow(scrollLeft > 0)
            setShowRightArrow(scrollLeft < scrollWidth - clientWidth - 10)
        }
    }, [])

    const scroll = (direction: 'left' | 'right') => {
        if (scrollContainerRef.current) {
            const scrollAmount = 300 // Adjust this value to control scroll distance
            const newScrollLeft = scrollContainerRef.current.scrollLeft +
                (direction === 'left' ? -scrollAmount : scrollAmount)

            scrollContainerRef.current.scrollTo({
                left: newScrollLeft,
                behavior: 'smooth'
            })
        }
    }

    const handleDragEnter = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(true)
    }

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)
    }

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault()
        e.stopPropagation()
        setIsDragging(false)

        const droppedFiles = Array.from(e.dataTransfer.files)
        addFiles(droppedFiles)
    }, [])

    const addFiles = (newFiles: File[]) => {
        // First filter heic files
        const heicFiles = newFiles.filter(file => {
            const extension = file.name.split('.').pop()?.toLowerCase();
            return extension === 'heic' || file.type === 'image/heic';
        });

        // Show error for non-heic files
        const invalidCount = newFiles.length - heicFiles.length;
        if (invalidCount > 0) {
            toast.error(
                invalidCount === 1 
                    ? '1 file rejected (only HEIC allowed)'
                    : `${invalidCount} files rejected (only HEIC allowed)`
            );
        }

        setFiles(prev => {
            // Check for duplicates against previous state
            const uniqueFiles = heicFiles.filter(newFile => 
                !prev.some(existing => existing.file.name === newFile.name)
            );

            // Show error for duplicates
            if (uniqueFiles.length < heicFiles.length) {
                const duplicateCount = heicFiles.length - uniqueFiles.length;
                toast.error(
                    duplicateCount === 1 
                        ? 'File already exists'
                        : `${duplicateCount} files already exist`
                );
            }

            // Create new file items
            const newItems = uniqueFiles.map(file => ({
                id: `${file.name}-${file.lastModified}`,
                file,
                preview: URL.createObjectURL(file),
                pdfUrl: null,
                status: 'pending' as 'pending' | 'converting' | 'done' | 'error',
                convertedData: null as string | null,
                convertedBlob: null as Blob | null,
                convertedFileName: null as string | null,
                error: null as string | null
            }));

            return [...prev, ...newItems];
        });

        // Start conversion for valid files
        heicFiles.forEach(file => handleConversion(file));

        setTimeout(checkScrollButtons, 100);
    };

    const handleConversion = async (file: File) => {
        // Update file status to converting
        setFiles(prev => 
            prev.map(item => 
                item.file === file 
                    ? { ...item, status: 'converting' } 
                    : item
            )
        );
        
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch('/api/convert', {
                method: 'POST',
                body: formData,
            });
            
            if (!response.ok) {
                throw new Error(`Conversion failed: ${response.status}`);
            }
            
            // Get the blob directly
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const fileName = `${file.name.replace(/\.[^/.]+$/, '')}.pdf`;
            
            // Update file state with the converted PDF
            setFiles(prev => 
                prev.map(item => 
                    item.file === file 
                        ? { 
                            ...item, 
                            status: 'done', 
                            pdfUrl: url,
                            convertedBlob: blob,
                            convertedFileName: fileName
                        } 
                        : item
                )
            );
        } catch (error) {
            console.error('Conversion error:', error);
            setFiles(prev => 
                prev.map(item => 
                    item.file === file 
                        ? { 
                            ...item, 
                            status: 'error', 
                            error: error instanceof Error ? error.message : 'Unknown error' 
                        } 
                        : item
                )
            );
        }
    };

    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            addFiles(Array.from(e.target.files))
        }
    }

    const removeFile = (id: string) => {
        setFiles(prev => prev.filter(file => file.id !== id))
        // Check scroll buttons after file is removed
        setTimeout(checkScrollButtons, 100)
    }

    const clearQueue = () => {
        setFiles([])
        setShowLeftArrow(false)
        setShowRightArrow(false)
    }

    const handleDownload = (item: FileItem) => {
        if (item.convertedBlob && item.convertedFileName) {
            // Create a new blob with explicit PDF type
            const pdfBlob = new Blob([item.convertedBlob], { 
                type: 'application/pdf' 
            });
            const downloadUrl = URL.createObjectURL(pdfBlob);
            
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = item.convertedFileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up the URL object after a short delay
            setTimeout(() => {
                URL.revokeObjectURL(downloadUrl);
            }, 100);
        }
    };

    const handleDownloadAll = () => {
        const convertedFiles = files.filter(
            item => item.status === 'done' && item.convertedBlob && item.convertedFileName
        );

        if (convertedFiles.length === 0) {
            toast.error('No converted files to download');
            return;
        }

        // If only one file, use single download
        if (convertedFiles.length === 1) {
            handleDownload(convertedFiles[0]);
            return;
        }

        // For multiple files, create a zip
        const zip = new JSZip();

        convertedFiles.forEach(item => {
            if (item.convertedBlob && item.convertedFileName) {
                // Ensure we're adding the PDF blob correctly
                zip.file(item.convertedFileName, item.convertedBlob);
            }
        });

        zip.generateAsync({ type: 'blob' }).then((content: Blob) => {
            const downloadUrl = URL.createObjectURL(content);
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = 'converted_pdfs.zip';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // Clean up the URL object after a short delay
            setTimeout(() => {
                URL.revokeObjectURL(downloadUrl);
            }, 100);
        });
    };

    // Add cleanup effect for PDF URLs
    useEffect(() => {
        return () => {
            files.forEach(file => {
                if (file.pdfUrl) {
                    URL.revokeObjectURL(file.pdfUrl);
                }
                if (file.preview) {
                    URL.revokeObjectURL(file.preview);
                }
            });
        };
    }, [files]);

    return (
        <div className="w-full max-w-4xl mx-auto p-6 bg-white rounded-2xl">
            {/* Navigation Tabs */}
            {/* <div className="flex flex-wrap gap-2 mb-6">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-colors duration-200
              ${activeTab === tab.id
                                ? 'bg-purple-600 text-white'
                                : 'bg-purple-50 text-purple-600 hover:bg-purple-100'}
            `}
                    >
                        {tab.label}
                    </button>
                ))}
            </div> */}

            {/* Action Buttons */}
            <div className="flex justify-center gap-4 mb-6">
                <button
                    className="inline-flex items-center justify-center px-4 py-2 font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-700 transition-colors duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                    onClick={() => document.getElementById('fileInput')?.click()}
                >
                    <Upload className="mr-2 h-4 w-4" />
                    {t('button')}
                </button>
                <button
                    className="flex items-center px-4 py-2 border border-purple-200 text-purple-600 rounded-lg hover:bg-purple-50 transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
                    onClick={clearQueue}
                >
                    <X className="mr-2 h-4 w-4" />
                    {t('clear-button')}
                </button>
                <input
                    id="fileInput"
                    type="file"
                    multiple
                    accept=".heic"
                    className="hidden"
                    onChange={handleFileInput}
                />
            </div>

            {/* Dropzone with Horizontal Scroll */}
            <div className="relative">
                <div
                    className={`
            border-2 border-dashed rounded-2xl p-8 mb-6 text-center transition-colors duration-200
            ${isDragging ? 'border-purple-600' : 'border-purple-200'}
            ${files.length === 0 ? 'h-64 flex items-center justify-center' : ''}
          `}
                    onDragEnter={handleDragEnter}
                    onDragOver={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                >
                    {files.length === 0 ? (
                        <div className="text-purple-400">{t('placeholder')}</div>
                    ) : (
                        <div className="relative">
                            {/* Left Arrow */}
                            {showLeftArrow && (
                                <button
                                    onClick={() => scroll('left')}
                                    className="absolute left-0 top-1/2 -translate-y-1/2 -ml-4 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center z-10 hover:bg-gray-50"
                                >
                                    <ChevronLeft className="h-5 w-5 text-purple-600" />
                                </button>
                            )}

                            {/* Scrollable Container */}
                            <div
                                ref={scrollContainerRef}
                                className="flex overflow-x-auto space-x-4 pb-4 scrollbar-hide"
                                onScroll={checkScrollButtons}
                            >
                                {files.map((item) => (
                                    <div
                                        key={item.id}
                                        className="flex-none w-44 relative bg-white rounded-lg shadow-md p-1 transition-transform duration-200 hover:scale-105"
                                        style={{ aspectRatio: '1/1' }}
                                    >
                                        <button
                                            className="absolute top-2 right-2 p-1 hover:bg-purple-100 rounded-full bg-purple-100 transition-colors duration-200 z-20"
                                            onClick={() => removeFile(item.id)}
                                        >
                                            <X className="h-4 w-4" />
                                        </button>

                                        {/* Preview container with 1:1 ratio */}
                                        <div className="absolute inset-0 z-0">
                                            <div className="relative h-full">
                                                {item.status === 'done' && item.pdfUrl && (
                                                    // PDF Preview with iframe
                                                    <div className="relative w-full h-full">
                                                        <iframe
                                                            src={item.pdfUrl}
                                                            className="w-full h-full rounded-lg"
                                                            style={{ border: 'none' }}
                                                            title={`Preview of ${item.file.name}`}
                                                        >
                                                            <div className="flex items-center justify-center h-full bg-gray-100 rounded-lg">
                                                                <p className="text-sm text-gray-500">PDF Preview</p>
                                                            </div>
                                                        </iframe>
                                                    </div>
                                                )}
                                                
                                                {item.status === 'converting' && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-lg">
                                                        <div className="loading-spinner" />
                                                    </div>
                                                )}
                                                {item.status === 'error' && (
                                                    <div className="absolute inset-0 flex items-center justify-center bg-red-500/50 rounded-lg">
                                                        <span className="text-white text-xs">{item.error}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Download button */}
                                        <div className="relative z-10 h-full flex flex-col justify-between">
                                            <button
                                                onClick={() => handleDownload(item)}
                                                className="w-full flex items-center justify-center py-2 bg-purple-100 backdrop-blur-sm rounded-lg hover:bg-purple-300 transition-colors duration-200 mt-auto text-black text-xs"
                                            >
                                                <Download className="mr-2 h-4 w-4" />
                                                {t('download-button')}
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Right Arrow */}
                            {showRightArrow && (
                                <button
                                    onClick={() => scroll('right')}
                                    className="absolute right-0 top-1/2 -translate-y-1/2 -mr-4 w-8 h-8 bg-white rounded-full shadow-lg flex items-center justify-center z-10 hover:bg-gray-50"
                                >
                                    <ChevronRight className="h-5 w-5 text-purple-600" />
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Download All Button */}
            {files.length > 0 && (
                <div className="flex justify-center">
                    <button
                        onClick={handleDownloadAll}
                        disabled={!files.some(f => f.status === 'done')}
                        className={`
                            inline-flex items-center justify-center px-4 py-2 font-medium text-white bg-indigo-500 rounded-lg hover:bg-indigo-700 transition-colors duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5
                            ${files.some(f => f.status === 'done')
                                ? 'bg-purple-500 text-purple-700 hover:bg-purple-700'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                    >
                        <Download className="mr-2 h-4 w-4" />
                        {t('download-all-button')} ({files.length})
                    </button>
                </div>
            )}
        </div>
    )
}

export default FileUploader;

