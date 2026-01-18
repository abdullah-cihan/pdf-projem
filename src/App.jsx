import React, { useState, useRef, useEffect } from 'react';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragOverlay
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  useSortable, 
  rectSortingStrategy 
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Files, 
  Scissors, 
  Upload, 
  Download, 
  Trash2, 
  GripVertical, 
  Check,
  Loader2
} from 'lucide-react';

// --- Script Yükleyici Yardımcı Fonksiyon ---
const loadScript = (src) => {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
};

// --- Yardımcı Fonksiyonlar ---

const readFile = (file) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsArrayBuffer(file);
  });
};

// --- YENİ BİLEŞEN: Asenkron PDF Thumbnail ---
// Bu bileşen sayfayı o an render eder, böylece yükleme sırasında beklemeyiz.
const PdfThumbnail = ({ pdfProxy, pageIndex, scale = 0.4 }) => {
    const canvasRef = useRef(null);
    const renderTaskRef = useRef(null);
    const [rendered, setRendered] = useState(false);

    useEffect(() => {
        if (!pdfProxy || !canvasRef.current) return;

        const render = async () => {
            try {
                const page = await pdfProxy.getPage(pageIndex + 1);
                const viewport = page.getViewport({ scale });
                
                const canvas = canvasRef.current;
                if(!canvas) return;
                
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                // Önceki işlemi iptal et (Hızlı kaydırma/re-render durumları için)
                if (renderTaskRef.current) {
                    try { renderTaskRef.current.cancel(); } catch(e) {}
                }

                const renderContext = {
                    canvasContext: context,
                    viewport: viewport,
                };
                
                const renderTask = page.render(renderContext);
                renderTaskRef.current = renderTask;
                
                await renderTask.promise;
                setRendered(true);
            } catch (err) {
                // RenderingCancelledException hatalarını yoksay
                if (err?.name !== 'RenderingCancelledException') {
                    console.error("Page render error:", err);
                }
            }
        };

        render();

        return () => {
            if (renderTaskRef.current) {
                try { renderTaskRef.current.cancel(); } catch(e) {}
            }
        };
    }, [pdfProxy, pageIndex, scale]);

    return (
        <div className="w-full h-full relative bg-slate-100 dark:bg-slate-900 flex items-center justify-center overflow-hidden">
             <canvas ref={canvasRef} className={`max-w-full max-h-full object-contain ${rendered ? 'opacity-100' : 'opacity-0'} transition-opacity duration-300`} />
             {!rendered && (
                 <div className="absolute inset-0 flex items-center justify-center">
                     <Loader2 className="animate-spin text-slate-400" size={20} />
                 </div>
             )}
        </div>
    );
};

// --- Bileşenler ---

// 1. Sidebar Navigasyon
const Sidebar = ({ activeTab, setActiveTab }) => {
  const menus = [
    { id: 'merge', icon: Files, label: 'Birleştir & Sırala' },
    { id: 'split', icon: Scissors, label: 'Ayır (Split)' },
  ];

  return (
    <div className="w-64 bg-slate-900 text-white h-screen flex flex-col fixed left-0 top-0 overflow-y-auto z-50">
      <div className="p-6 border-b border-slate-700">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
          PDF Master
        </h1>
        <p className="text-xs text-slate-400 mt-1">Sunucusuz PDF Aracı</p>
      </div>
      <nav className="flex-1 p-4 space-y-2">
        {menus.map((m) => (
          <button
            key={m.id}
            onClick={() => setActiveTab(m.id)}
            className={`flex items-center w-full p-3 rounded-lg transition-all ${
              activeTab === m.id 
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <m.icon size={20} className="mr-3" />
            <span className="font-medium">{m.label}</span>
          </button>
        ))}
      </nav>
      <div className="p-4 border-t border-slate-700 text-xs text-slate-500 text-center">
        Client-side PDF Processing
      </div>
    </div>
  );
};

// --- Sortable Item Component (Merge Modülü İçin) ---
const SortablePage = ({ id, page, pdfProxy, onRemove }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden select-none ${isDragging ? 'opacity-50 ring-2 ring-blue-500' : ''}`}
    >
      <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={() => onRemove(id)}
          className="p-1 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-sm cursor-pointer"
          onPointerDown={(e) => e.stopPropagation()} // Sürüklemeyi engelle
        >
          <Trash2 size={14} />
        </button>
      </div>
      
      <div className="aspect-[1/1.414] w-full relative">
        {/* Anlık render bileşeni */}
        <PdfThumbnail pdfProxy={pdfProxy} pageIndex={page.pageIndex} />
      </div>

      <div 
        {...attributes} 
        {...listeners} 
        className="h-8 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 flex items-center justify-center cursor-move hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
      >
        <GripVertical size={14} className="text-slate-400" />
        <span className="text-xs text-slate-500 ml-1">S. {page.pageIndex + 1}</span>
      </div>
    </div>
  );
};

// --- MODÜL 1: MERGE (BİRLEŞTİRME) ---
const MergeModule = () => {
  const [pages, setPages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pdfsData, setPdfsData] = useState({}); // Binary veriler (Merge işlemi için)
  const [pdfProxies, setPdfProxies] = useState({}); // PDF.js Proxy Nesneleri (Görüntüleme için)

  const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: {
            distance: 8, // Yanlışlıkla tıklamaları önlemek için
        },
    }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleFileUpload = async (e) => {
    setIsProcessing(true);
    const files = Array.from(e.target.files);
    
    const newPages = [];
    const newPdfsData = { ...pdfsData };
    const newPdfProxies = { ...pdfProxies };

    try {
        for (const file of files) {
        const arrayBuffer = await readFile(file);
        const pdfId = `${file.name}-${Date.now()}`;
        
        // 1. Veriyi sakla (Orijinal veriyi)
        newPdfsData[pdfId] = arrayBuffer;

        // 2. Proxy oluştur
        // ÖNEMLİ: Buffer'ın kopyasını (.slice(0)) PDF.js'e veriyoruz.
        const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
        const pdfProxy = await loadingTask.promise;
        newPdfProxies[pdfId] = pdfProxy;

        // 3. Metadata oluştur
        for (let i = 0; i < pdfProxy.numPages; i++) {
            newPages.push({
            id: `${pdfId}-page-${i}`,
            pdfId: pdfId,
            pageIndex: i,
            fileName: file.name
            });
        }
        }

        setPdfsData(newPdfsData);
        setPdfProxies(newPdfProxies);
        setPages((prev) => [...prev, ...newPages]);
    } catch (error) {
        console.error("Yükleme hatası:", error);
        alert("Dosya yüklenirken hata oluştu.");
    } finally {
        setIsProcessing(false);
    }
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setPages((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const handleRemovePage = (id) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
  };

  const handleMergeAndDownload = async () => {
    if (pages.length === 0) return;
    setIsProcessing(true);

    try {
      const { PDFDocument } = window.PDFLib;
      const mergedPdf = await PDFDocument.create();

      // Optimize: Her PDF dosyasını sadece BİR kez yükle
      const loadedPdfDocs = {};

      for (const pageInfo of pages) {
        const { pdfId, pageIndex } = pageInfo;
        
        // Eğer bu PDF daha önce yüklenmediyse yükle ve sakla
        if (!loadedPdfDocs[pdfId]) {
            const sourceBytes = pdfsData[pdfId];
            if (!sourceBytes) {
                console.warn(`PDF verisi bulunamadı: ${pdfId}`);
                continue;
            }
            loadedPdfDocs[pdfId] = await PDFDocument.load(sourceBytes);
        }

        const sourcePdf = loadedPdfDocs[pdfId];
        // Sayfayı kopyala
        const [copiedPage] = await mergedPdf.copyPages(sourcePdf, [pageIndex]);
        mergedPdf.addPage(copiedPage);
      }

      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'merged-document.pdf';
      link.click();
    } catch (error) {
      console.error("Merge error:", error);
      alert("Birleştirme sırasında teknik bir hata oluştu: " + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  // DragOverlay için aktif öğeyi bul
  const [activeId, setActiveId] = useState(null);
  const activePage = activeId ? pages.find(p => p.id === activeId) : null;

  return (
    <div className="p-8">
        <div className="flex justify-between items-center mb-8">
            <div>
                <h2 className="text-3xl font-bold text-slate-800 dark:text-white">PDF Birleştirici</h2>
                <p className="text-slate-500">Dosyaları yükleyin, sayfaları sıralayın ve birleştirin.</p>
            </div>
            <div className="flex space-x-4">
                <label className="flex items-center px-4 py-2 bg-slate-200 text-slate-700 rounded-lg hover:bg-slate-300 cursor-pointer transition">
                    <Upload size={18} className="mr-2" />
                    <span>PDF Ekle</span>
                    <input type="file" multiple accept="application/pdf" className="hidden" onChange={handleFileUpload} />
                </label>
                <button 
                    onClick={handleMergeAndDownload}
                    disabled={pages.length === 0 || isProcessing}
                    className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-lg shadow-blue-600/30"
                >
                    {isProcessing ? <Loader2 className="animate-spin mr-2" size={18}/> : <Download size={18} className="mr-2" />}
                    <span>Birleştir & İndir</span>
                </button>
            </div>
        </div>

        <div className="bg-slate-100 dark:bg-slate-900/50 p-6 rounded-2xl min-h-[500px] border border-dashed border-slate-300 dark:border-slate-700">
            {pages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 mt-20">
                    <Files size={48} className="mb-4 opacity-50" />
                    <p>Henüz hiç PDF yüklenmedi.</p>
                </div>
            ) : (
                <DndContext 
                    sensors={sensors} 
                    collisionDetection={closestCenter} 
                    onDragStart={(event) => setActiveId(event.active.id)}
                    onDragEnd={(event) => { handleDragEnd(event); setActiveId(null); }}
                >
                    <SortableContext items={pages.map(p => p.id)} strategy={rectSortingStrategy}>
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {pages.map((page) => (
                                <SortablePage 
                                    key={page.id} 
                                    id={page.id} 
                                    page={page} 
                                    pdfProxy={pdfProxies[page.pdfId]}
                                    onRemove={handleRemovePage} 
                                />
                            ))}
                        </div>
                    </SortableContext>
                    <DragOverlay>
                        {activePage ? (
                             <div className="opacity-80">
                                {/* Drag sırasında proxy'i bulup render ediyoruz */}
                                <SortablePage 
                                    id={activePage.id} 
                                    page={activePage} 
                                    pdfProxy={pdfProxies[activePage.pdfId]} 
                                    onRemove={() => {}} 
                                />
                             </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
            )}
        </div>
    </div>
  );
};

// --- MODÜL 2: SPLIT (BÖLME) ---
const SplitModule = () => {
  const [file, setFile] = useState(null);
  const [pdfData, setPdfData] = useState(null);
  const [pdfProxy, setPdfProxy] = useState(null); // Tekil Proxy
  const [pages, setPages] = useState([]);
  const [selectedPages, setSelectedPages] = useState(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [rangeInput, setRangeInput] = useState("");

  const handleFileUpload = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setIsProcessing(true);
    
    try {
        const data = await readFile(f);
        setPdfData(data);
        setFile(f);

        // KOPYA gönder
        const loadingTask = window.pdfjsLib.getDocument({ data: data.slice(0) });
        const proxy = await loadingTask.promise;
        setPdfProxy(proxy);
        
        // Hızlıca sayfa listesi oluştur (Render YOK)
        const newPages = [];
        for (let i = 0; i < proxy.numPages; i++) {
            newPages.push({ index: i });
        }
        setPages(newPages);
    } catch(err) {
        console.error(err);
        alert("Dosya açılırken hata oluştu.");
    } finally {
        setIsProcessing(false);
    }
  };

  const togglePageSelection = (index) => {
    const newSet = new Set(selectedPages);
    if (newSet.has(index)) {
      newSet.delete(index);
    } else {
      newSet.add(index);
    }
    setSelectedPages(newSet);
  };

  const handleRangeSelect = () => {
    const newSet = new Set();
    const parts = rangeInput.split(',');
    
    parts.forEach(part => {
      const p = part.trim();
      if (p.includes('-')) {
        const [start, end] = p.split('-').map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) {
            if (i > 0 && i <= pages.length) newSet.add(i - 1);
          }
        }
      } else {
        const num = Number(p);
        if (!isNaN(num) && num > 0 && num <= pages.length) {
          newSet.add(num - 1);
        }
      }
    });
    setSelectedPages(newSet);
  };

  const handleSplitAndDownload = async () => {
    if (!pdfData || selectedPages.size === 0) return;
    setIsProcessing(true);
    try {
        const { PDFDocument } = window.PDFLib;
        const sourcePdf = await PDFDocument.load(pdfData);
        const newPdf = await PDFDocument.create();
        
        const sortedIndices = Array.from(selectedPages).sort((a, b) => a - b);
        const copiedPages = await newPdf.copyPages(sourcePdf, sortedIndices);
        
        copiedPages.forEach(p => newPdf.addPage(p));
        
        const pdfBytes = await newPdf.save();
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `split-${file.name}`;
        link.click();
    } catch(err) {
        console.error(err);
        alert("Bölme işlemi başarısız.");
    } finally {
        setIsProcessing(false);
    }
  };

  return (
    <div className="p-8">
        <div className="flex justify-between items-center mb-8">
             <div>
                <h2 className="text-3xl font-bold text-slate-800 dark:text-white">PDF Ayırıcı</h2>
                <p className="text-slate-500">İstediğiniz sayfaları seçin ve yeni bir dosya olarak kaydedin.</p>
            </div>
             <div className="flex gap-4">
                {!file ? (
                    <label className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer shadow-lg shadow-blue-600/30 transition">
                        <Upload size={18} className="mr-2" />
                        <span>PDF Yükle</span>
                        <input type="file" accept="application/pdf" className="hidden" onChange={handleFileUpload} />
                    </label>
                ) : (
                    <button 
                        onClick={handleSplitAndDownload}
                        disabled={selectedPages.size === 0}
                        className="flex items-center px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-green-600/30 transition"
                    >
                         {isProcessing ? <Loader2 className="animate-spin mr-2"/> : <Download size={18} className="mr-2" />}
                         <span>Seçilenleri İndir ({selectedPages.size})</span>
                    </button>
                )}
             </div>
        </div>

        {file && (
            <div className="mb-6 bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm flex items-center gap-4">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Aralık ile Seç (Örn: 1-3, 5):</span>
                <input 
                    type="text" 
                    value={rangeInput}
                    onChange={(e) => setRangeInput(e.target.value)}
                    placeholder="1-5, 8"
                    className="border border-slate-300 dark:border-slate-600 rounded px-3 py-1 text-sm bg-transparent"
                />
                <button 
                    onClick={handleRangeSelect}
                    className="text-sm px-3 py-1 bg-slate-200 dark:bg-slate-700 rounded hover:bg-slate-300 dark:hover:bg-slate-600"
                >
                    Uygula
                </button>
                <button 
                    onClick={() => setSelectedPages(new Set())}
                    className="text-sm text-red-500 ml-auto hover:underline"
                >
                    Seçimi Temizle
                </button>
            </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 lg:grid-cols-8 gap-4">
            {pages.map((page) => (
                <div 
                    key={page.index}
                    onClick={() => togglePageSelection(page.index)}
                    className={`relative cursor-pointer group rounded-lg overflow-hidden border-2 transition-all ${
                        selectedPages.has(page.index) 
                        ? 'border-blue-500 ring-2 ring-blue-500/30 transform scale-105 z-10' 
                        : 'border-transparent hover:border-slate-300'
                    }`}
                >
                    <div className="aspect-[1/1.414] bg-slate-100 dark:bg-slate-900">
                         {/* Split modülü için de async render */}
                         <PdfThumbnail pdfProxy={pdfProxy} pageIndex={page.index} />
                    </div>
                    {selectedPages.has(page.index) && (
                        <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full p-1 z-20">
                            <Check size={12} />
                        </div>
                    )}
                    <div className="absolute bottom-0 w-full bg-black/50 text-white text-center text-xs py-1 z-10">
                        Sayfa {page.index + 1}
                    </div>
                </div>
            ))}
        </div>
    </div>
  );
};

// --- ANA UYGULAMA ---
function App() {
  const [activeTab, setActiveTab] = useState('merge');
  const [libsLoaded, setLibsLoaded] = useState(false);

  useEffect(() => {
    const initLibs = async () => {
        try {
            await loadScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
            
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            }
            setLibsLoaded(true);
        } catch (err) {
            console.error("Kütüphaneler yüklenemedi:", err);
            alert("PDF kütüphaneleri yüklenirken hata oluştu.");
        }
    };
    initLibs();
  }, []);

  if (!libsLoaded) {
      return (
          <div className="h-screen w-full flex items-center justify-center bg-slate-900 text-white flex-col">
              <Loader2 size={48} className="animate-spin mb-4 text-blue-500" />
              <p>PDF Motoru Başlatılıyor...</p>
          </div>
      )
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-black font-sans text-slate-900 dark:text-slate-100">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      
      <main className="ml-64 flex-1 h-screen overflow-auto">
        {activeTab === 'merge' && <MergeModule />}
        {activeTab === 'split' && <SplitModule />}
      </main>
    </div>
  );
}

export default App;