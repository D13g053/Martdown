const RETRASO_ACTUALIZACION = 150;
const NOMBRE_ARCHIVO_POR_DEFECTO = 'documento.md';

const CLAVES_STORAGE = {
    TEMA: 'tema',
    TITULO: 'tituloDocumento',
};

const CLASES_CSS = {
    TEMA_OSCURO: 'tema-oscuro',
    VISTA_EDITOR: 'solo-editor',
    VISTA_PREVIEW: 'solo-preview',
    VISTA_AMBOS: 'ambos',
    ACTIVO: 'activo',
};

let estado = {
    temporizador: null,
    ultimoMarkdownRenderizado: '',
    nombreArchivoActual: NOMBRE_ARCHIVO_POR_DEFECTO,
    documentoModificado: false,
    modalAbierto: false,
    accionPendiente: null
};

const DOM = {};

document.addEventListener('DOMContentLoaded', () => {
    iniciarCargaDeLibrerias();
});

function iniciarCargaDeLibrerias() {
    const crearPromesaDeCarga = (lib, selector) =>
        new Promise((resolve) => {
            if (window[lib]) return resolve();
            const script = document.querySelector(`script[src*="${selector}"]`);
            if (script) script.onload = resolve;
            else reject(new Error(`${lib} script not found`));
        });

    Promise.all([
        crearPromesaDeCarga('marked', 'marked.min.js'),
        crearPromesaDeCarga('katex', 'katex.min.js'),
        crearPromesaDeCarga('renderMathInElement', 'auto-render.min.js'),
        crearPromesaDeCarga('hljs', 'highlight.min.js'),
        crearPromesaDeCarga('mermaid', 'mermaid.min.js'),
    ])
        .then(iniciarAplicacion)
        .catch(manejarErrorCarga);
}

function iniciarAplicacion() {
    cachearElementosDOM();
    configurarLibrerias();
    cargarCSSKaTeX();
    configurarEventos();
    cargarPreferenciasUsuario();
    finalizarCargaUI();
    configurarEventosModal();
    configurarEventosElectron();
}

function cargarCSSKaTeX() {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'katex/katex.min.css';
    document.head.appendChild(link);
}

function cachearElementosDOM() {
    const ids = ['editor', 'previsualizacion', 'mensaje-carga', 'barra-herramientas', 'titulo-documento', 'indicador-guardado', 'icono-luna', 'icono-sol', 'btn-tema', 'modal-advertencia', 'btn-modal-cancelar', 'btn-modal-confirmar', 'modal-titulo', 'modal-mensaje'];
    ids.forEach(id => DOM[id] = document.getElementById(id));
    DOM.body = document.body;
}

function configurarLibrerias() {
    const temaGuardado = localStorage.getItem(CLAVES_STORAGE.TEMA);
    const temaMermaid = temaGuardado === 'oscuro' ? 'dark' : 'default';

    mermaid.initialize({
        startOnLoad: false,
        theme: temaMermaid,
        securityLevel: 'loose',
        maxTextSize: 100000,
        fontFamily: 'inherit',
    });

    hljs.configure({
        ignoreUnescapedHTML: true,
        cssSelector: 'pre code:not(.language-mermaid)',
    });

    marked.use({
        tokenizer: {
            escape(src) {
                const match = src.match(/^\\(.)/s);
                if (match) {
                    return {
                        type: 'text',
                        raw: match[0],
                        text: match[0]
                    };
                }
                return false;
            }
        },
    });

}

function cargarPreferenciasUsuario() {
    if (localStorage.getItem(CLAVES_STORAGE.TEMA) === 'oscuro') {
        DOM.body.classList.add(CLASES_CSS.TEMA_OSCURO);
        actualizarIconosTema(true);
    }

    const tituloGuardado = localStorage.getItem(CLAVES_STORAGE.TITULO) || '';
    DOM['titulo-documento'].value = tituloGuardado;
    estado.nombreArchivoActual = tituloGuardado ? `${tituloGuardado}.md` : NOMBRE_ARCHIVO_POR_DEFECTO;

    actualizarEstadoGuardado();
}

function finalizarCargaUI() {
    DOM['mensaje-carga'].style.opacity = '0';
    setTimeout(() => DOM['mensaje-carga'].style.display = 'none', 300);

    renderizarMarkdown();
    setTimeout(renderizarMarkdown, 100);
}

function configurarEventos() {
    DOM['barra-herramientas'].addEventListener('click', (e) => {
        const boton = e.target.closest('button');
        if (!boton || !boton.id) return;

        const accion = accionesBotones[boton.id];
        if (accion) {
            e.preventDefault();
            accion();
        }
    });

    DOM.editor.addEventListener('input', () => {
        actualizarConRetraso();
        actualizarEstadoModificacion(true);
    });

    DOM['titulo-documento'].addEventListener('input', function () {
        localStorage.setItem(CLAVES_STORAGE.TITULO, this.value);
        estado.nombreArchivoActual = this.value ? `${this.value}.md` : NOMBRE_ARCHIVO_POR_DEFECTO;
        actualizarEstadoModificacion(true);
    });

    window.addEventListener('resize', actualizarConRetraso);
    cambiarVista(CLASES_CSS.VISTA_AMBOS);

    document.getElementById('btn-math-inline').addEventListener('click', () => {
        insertarTexto('$', '$', 'expresión');
        panelMatematicas.classList.remove('visible');
    });

    document.getElementById('btn-math-block').addEventListener('click', () => {
        insertarTexto('$$\n', '\n$$', 'expresión');
        panelMatematicas.classList.remove('visible');
});
}

const accionesBotones = {
    'btn-h1': () => insertarTexto('# ', '', 'Título 1'),
    'btn-h2': () => insertarTexto('## ', '', 'Título 2'),
    'btn-h3': () => insertarTexto('### ', '', 'Título 3'),
    'btn-bold': () => insertarTexto('**', '**', 'texto'),
    'btn-italic': () => insertarTexto('*', '*', 'texto'),
    'btn-strike': () => insertarTexto('~~', '~~', 'texto'),
    'btn-ol': () => insertarTexto('1. ', '', 'Elemento'),
    'btn-ul': () => insertarTexto('- ', '', 'Elemento'),
    'btn-task': () => insertarTexto('- [ ] ', '', 'Tarea'),
    'btn-link': () => insertarTexto('[', '](https://)', 'texto'),
    'btn-image': () => insertarTexto('![', '](imagen.jpg)', 'descripción'),
    'btn-quote': () => insertarTexto('> ', '', 'Cita'),
    'btn-code': () => insertarTexto('```\n', '\n```', 'código'),
    'btn-table': () => insertarTexto('\n| Cabecera  | Cabecera  |\n|-----------|-----------|\n| Celda     | Celda     |\n\n'),
    'btn-hr': () => insertarTexto('\n---\n'),
    'btn-center': () => insertarTexto('<center>\n', '\n</center>', 'Texto centrado'),
    'btn-nuevo': nuevoDocumento,
    'btn-guardar': guardarArchivo,
    'btn-abrir': abrirArchivo,
    'btn-html': exportarHTML,
    'btn-pdf': () => exportarPDF(),
    'btn-vista-editor': () => cambiarVista(CLASES_CSS.VISTA_EDITOR),
    'btn-vista-preview': () => cambiarVista(CLASES_CSS.VISTA_PREVIEW),
    'btn-vista-ambos': () => cambiarVista(CLASES_CSS.VISTA_AMBOS),
    'btn-tema': cambiarTema,
    'btn-mermaid': () => togglePanelMermaid(),
};

function actualizarConRetraso() {
    clearTimeout(estado.temporizador);
    estado.temporizador = setTimeout(renderizarMarkdown, RETRASO_ACTUALIZACION);
}

function renderizarMarkdown() {
    const markdown = DOM.editor.value;
    if (markdown === estado.ultimoMarkdownRenderizado) return;
    
    estado.ultimoMarkdownRenderizado = markdown;
    try {
        marked.parse(markdown, { mangle: false, headerIds: false });
        DOM.previsualizacion.innerHTML = marked.parse(markdown);
        DOM.previsualizacion.querySelectorAll('a').forEach(enlace => {
            enlace.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Enlace clickeado:', enlace.href);
            });
        });
        
    } catch (e) {
        console.error('Error al procesar Markdown:', e);
        DOM.previsualizacion.innerHTML = `<div class="error">${e.message}</div>`;
        return;
    }
    renderizarElementosEspeciales();
}

function renderizarElementosEspeciales() {
    try {
        renderMathInElement(DOM.previsualizacion, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$', right: '$', display: false },
                { left: '\\[', right: '\\]', display: true },
                { left: '\\(', right: '\\)', display: false }
            ],
            throwOnError: false,
            strict: false
        });
    } catch (e) {
        console.error('Error en renderMathInElement:', e);
    }

    procesarBloquesCodigo();
}

function procesarBloquesCodigo() {
    const bloquesMermaid = [];
    const bloquesCodigo = DOM.previsualizacion.querySelectorAll('pre code');

    bloquesCodigo.forEach(bloque => {
        if (bloque.classList.contains('language-mermaid')) {
            const contenedor = document.createElement('div');
            contenedor.className = 'mermaid';
            contenedor.textContent = bloque.textContent;
            bloque.parentElement.replaceWith(contenedor);
            bloquesMermaid.push(contenedor);
        } else {
            try {
                hljs.highlightElement(bloque);
            } catch (e) {
                console.error('Error en highlight.js:', e);
            }
        }
    });

    if (bloquesMermaid.length > 0) {
        mermaid.run({ nodes: bloquesMermaid, suppressErrors: true })
            .catch(error => manejarErrorMermaid(bloquesMermaid, error));
    }
}

function nuevoDocumento() {
    if (estado.documentoModificado) {
        mostrarModal(() => {
            DOM.editor.value = '';
            DOM['titulo-documento'].value = '';
            estado.nombreArchivoActual = NOMBRE_ARCHIVO_POR_DEFECTO;
            localStorage.setItem(CLAVES_STORAGE.TITULO, '');
            estado.ultimoMarkdownRenderizado = '';
            DOM.previsualizacion.innerHTML = '';
            renderizarMarkdown();
            actualizarEstadoModificacion(false);
        }, 'nuevo');
        return;
    }

    DOM.editor.value = '';
    DOM['titulo-documento'].value = '';
    estado.nombreArchivoActual = NOMBRE_ARCHIVO_POR_DEFECTO;
    localStorage.setItem(CLAVES_STORAGE.TITULO, '');
    estado.ultimoMarkdownRenderizado = '';
    DOM.previsualizacion.innerHTML = '';
    renderizarMarkdown();
    actualizarEstadoModificacion(false);
}

function guardarArchivo() {
    const contenido = DOM.editor.value;
    if (!contenido) return;

    const blob = new Blob([contenido], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = estado.nombreArchivoActual;
    a.click();

    setTimeout(() => {
        URL.revokeObjectURL(url);
        actualizarEstadoModificacion(false);
    }, 100);
}

function abrirArchivo() {
    const abrirSelectorArchivos = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.md,.markdown,text/plain';
        input.onchange = e => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = event => {
                DOM.editor.value = event.target.result;
                const nombreSinExtension = file.name.replace(/\.[^/.]+$/, '');
                DOM['titulo-documento'].value = nombreSinExtension;
                localStorage.setItem(CLAVES_STORAGE.TITULO, nombreSinExtension);
                estado.nombreArchivoActual = file.name;
                estado.ultimoMarkdownRenderizado = '';
                renderizarMarkdown();
                actualizarEstadoModificacion(false);
            };
            reader.readAsText(file);
        };
        input.click();
    };

    if (estado.documentoModificado) {
        mostrarModal(abrirSelectorArchivos, 'abrir');
        return;
    }

    abrirSelectorArchivos();
}

const estilosBaseExportacion = `
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; line-height: 1.7; max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 2.4rem; margin: 1.5rem 0; border-bottom: none; }
    h2 { font-size: 2.0rem; margin: 1.3rem 0; }
    h3 { font-size: 1.6rem; margin: 1.1rem 0; }
    p { margin-bottom: 1em; }
    a { text-decoration: underline; text-underline-offset: 3px; }
    pre { padding: 1.5rem; border-radius: 10px; margin: 1.8rem 0; overflow: auto; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
    pre code { background: transparent !important; padding: 0 !important; border: none !important; font-size: 0.95em; line-height: 1.5; }
    code:not(pre code) { font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace; padding: 0.25em 0.5em; border-radius: 4px; font-size: 0.9em; }
    blockquote { padding: 1.25rem 1.5rem; margin: 1.5rem 0; border-radius: 6px; font-style: italic; }
    ul, ol { margin-left: 1.8rem; margin-bottom: 1.5rem; }
    li { margin-bottom: 0.75rem; }
    img { max-width: 100%; border-radius: 8px; margin: 1.5rem 0; }
    hr { border: 0; height: 2px; margin: 1.8rem 0; width: 100%; opacity: 0.5; }
    .table-container { overflow-x: auto; margin: 1.5em 0; max-width: 100%; }
    table { border-collapse: collapse; margin: 0; width: 100%; box-shadow: 0 2px 15px rgba(27, 27, 27, 0.05); border-radius: 8px; overflow: hidden; font-size: 0.95em; }
    th { font-weight: 600; text-align: left; padding: 16px 15px; }
    td { padding: 14px 15px; }
    .mermaid { padding: 15px; border-radius: 6px; margin-bottom: 1.5em; text-align: center; }
    .mermaid-error { border-radius: 4px; padding: 10px; font-family: monospace; overflow: auto; margin-bottom: 1.5em; }
`;

const estilosTemaClaroExportacion = `
    body { background-color: white; color: #333; }
    strong { color: #1e293b; }
    em { color: #475569; }
    pre { background-color: #f8fafc !important; border: 1px solid #e2e8f0; }
    pre code { color: #334155; }
    code:not(pre code) { background-color: #f1f5f9; color: #dc2626; border: 1px solid #e2e8f0; }
    blockquote { color: #475569; background-color: #f8fafc; }
    hr { background: #e2e8f0; }
    .table-container {  overflow-x: auto; margin: 1.5em 0; max-width: 100%; }
    table { border-collapse: collapse; margin: 0; width: 100%; box-shadow: 0 2px 15px rgba(0, 0, 0, 0.05); border-radius: 8px; overflow: hidden; font-size: 0.95em; min-width: 100%; }
    th { background-color: #f8f9fa; font-weight: 600; text-align: left; padding: 16px 15px; border-bottom: 2px solid #e9ecef; color: #495057; }
    td { padding: 14px 15px; border-top: 1px solid #f1f3f5; color: #495057; }
    tr:nth-child(even) { background-color: #fcfcfc; }
    tr:hover { background-color: #e7ecf0d9; }
    thead tr { box-shadow: 0 2px 4px rgba(0,0,0,0.03); }
    tbody tr:first-child td { border-top: none; }
    .mermaid { background-color: white; border: 1px solid #cbd4dd; }
    a { color: #2563eb; }
    a:hover { color: #1d4ed8; }
`;

const estilosTemaOscuroExportacion = `
    body { background-color: #121212; color: #e8e6e3; }
    h1, h2, h3, h4, h5, h6 { color: #ffffff; }
    strong { color: #ffffff !important; }
    em { color: #d0d0d0 !important; }
    pre { background-color: #1a1a1a !important; border: 1px solid #2d2d2d !important; }
    pre code { color: #e0e0e0 !important; }
    code:not(pre code) { background-color: #2a2a2a; color: #f0f0f0; border: 1px solid #444; }
    blockquote { background-color: #1a1a1a; color: #d0d0d0; }
    table { box-shadow: 0 2px 15px rgba(0, 0, 0, 0.3); }
    th { background-color: #2d2d2d; color: #ffffff; border-bottom: 2px solid #444; }
    td { color: #e0e0e0; border-top: 1px solid #333; }
    tr:nth-child(even) { background-color: #252525; }
    tr:hover { background-color: #2f2f2f; }
    .mermaid { background-color: #1a1a1a; border: 1px solid #333; }
    .mermaid-error { background-color: #2d0000; border: 1px solid #5c0000; color: #ff6e6e; }
    a { color: #64b5f6; }
    a:hover { color: #90caf9; }
`;

async function cargarRecursoComoBase64(url) {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error('Error cargando recurso:', error);
        return '';
    }
}

function insertarTexto(antes, despues = '', textoPorDefecto = '') {
    const { selectionStart: inicio, selectionEnd: fin, value: textoActual } = DOM.editor;
    const textoSeleccionado = textoActual.substring(inicio, fin);
    const textoAInsertar = textoSeleccionado ?
        antes + textoSeleccionado + despues :
        antes + textoPorDefecto + despues;

    DOM.editor.value = textoActual.substring(0, inicio) + textoAInsertar + textoActual.substring(fin);

    if (textoSeleccionado) {
        DOM.editor.selectionStart = inicio + antes.length;
        DOM.editor.selectionEnd = fin + antes.length;
    } else {
        DOM.editor.selectionStart = inicio + antes.length;
        DOM.editor.selectionEnd = inicio + antes.length + textoPorDefecto.length;
    }

    DOM.editor.focus();
    DOM.editor.dispatchEvent(new Event('input', { bubbles: true }));
    
    setTimeout(() => {
        if (panelMatematicas.classList.contains('visible')) {
            panelMatematicas.classList.remove('visible');
        }
    }, 100);
}

function cambiarVista(vista) {
    DOM.body.classList.remove(CLASES_CSS.VISTA_EDITOR, CLASES_CSS.VISTA_PREVIEW, CLASES_CSS.VISTA_AMBOS);
    DOM.body.classList.add(vista);
    DOM['barra-herramientas'].querySelectorAll('button[id^="btn-vista-"]').forEach(btn => {
        btn.classList.remove(CLASES_CSS.ACTIVO);
    });

    const botonActivo = {
        [CLASES_CSS.VISTA_EDITOR]: 'btn-vista-editor',
        [CLASES_CSS.VISTA_PREVIEW]: 'btn-vista-preview',
        [CLASES_CSS.VISTA_AMBOS]: 'btn-vista-ambos',
    };

    document.getElementById(botonActivo[vista])?.classList.add(CLASES_CSS.ACTIVO);
    setTimeout(renderizarMarkdown, 50);
}

function cambiarTema() {
    const esOscuro = DOM.body.classList.toggle(CLASES_CSS.TEMA_OSCURO);
    localStorage.setItem(CLAVES_STORAGE.TEMA, esOscuro ? 'oscuro' : 'claro');
    actualizarIconosTema(esOscuro);
    mermaid.initialize({ theme: esOscuro ? 'dark' : 'default' });
    estado.ultimoMarkdownRenderizado = '';
    renderizarMarkdown();
}

function actualizarIconosTema(esOscuro) {
    DOM['icono-luna'].style.display = esOscuro ? 'none' : 'block';
    DOM['icono-sol'].style.display = esOscuro ? 'block' : 'none';
    DOM['btn-tema'].title = esOscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
}

function actualizarEstadoModificacion(modificado) {
    estado.documentoModificado = modificado;
    actualizarEstadoGuardado();
}

function actualizarEstadoGuardado() {
    if (DOM['indicador-guardado']) {
        const modificado = estado.documentoModificado;
        DOM['indicador-guardado'].textContent = modificado ? '●' : '✓';
        DOM['indicador-guardado'].title = modificado ? 'Cambios sin guardar' : 'Todos los cambios guardados';
    }
}

function manejarErrorCarga(error) {
    console.error('Error al cargar las bibliotecas:', error);
    const mensajeCarga = DOM['mensaje-carga'] || document.getElementById('mensaje-carga');
    mensajeCarga.textContent = 'Error al cargar las bibliotecas. Por favor, recarga la página.';
    mensajeCarga.style.opacity = '1';
    mensajeCarga.style.display = 'flex';
}

function manejarErrorMermaid(contenedores, error) {
    console.error('Error en Mermaid:', error);
    contenedores.forEach(container => {
        container.innerHTML = `
            <div class="mermaid-error">
                <strong>Error en diagrama:</strong>
                <pre>${error.message}</pre>
                <pre>${container.textContent}</pre>
            </div>
        `;
    });
}

async function generarHTMLParaExportacion() {
    const esTemaOscuro = localStorage.getItem(CLAVES_STORAGE.TEMA) === 'oscuro';
    const titulo = DOM['titulo-documento'].value || 'documento';
    const contenido = DOM.previsualizacion.innerHTML;

    let katexStyles = '';
    try {
        const response = await fetch('katex.min.css');
        if (response.ok) {
            katexStyles = await response.text();
            const fontMatches = katexStyles.match(/url\(['"]?fonts\/([^'")]+)['"]?\)/g) || [];
            for (const match of fontMatches) {
                const fontPath = match.match(/fonts\/([^'")]+)/)[1];
                const base64Font = await cargarRecursoComoBase64(`fonts/${fontPath}`);
                if (base64Font) {
                    katexStyles = katexStyles.replace(
                        new RegExp(`url\\(['"]?fonts\\/${fontPath}['"]?\\)`, 'g'),
                        `url(${base64Font})`
                    );
                }
            }
        }
    } catch (error) {
        console.error('Error al obtener la hoja de estilos de KaTeX:', error);
    }

    let hljsStyles = '';
    try {
        const temaHighlight = esTemaOscuro ? 'github-dark' : 'github';
        const response = await fetch(`${temaHighlight}.min.css`);
        if (response.ok) {
            hljsStyles = await response.text();
        }
    } catch (error) {
        console.error('Error al obtener la hoja de estilos de highlight.js:', error);
    }

    const temaEstilos = esTemaOscuro ? estilosTemaOscuroExportacion : estilosTemaClaroExportacion;
    const estilos = `<style>${estilosBaseExportacion}\n${temaEstilos}\n${katexStyles}\n${hljsStyles}</style>`;

    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${titulo}</title>
    ${estilos}
</head>
<body class="markdown-body">
    ${contenido}
</body>
</html>`;
}


async function exportarHTML() {
    const titulo = DOM['titulo-documento'].value || 'documento';
    const htmlCompleto = await generarHTMLParaExportacion();

    const blob = new Blob([htmlCompleto], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${titulo}.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

async function exportarPDF() {
    if (window.electronAPI && typeof window.electronAPI.exportarPDF === 'function') {
        DOM.body.style.cursor = 'wait';
        try {
            const htmlCompleto = await generarHTMLParaExportacion();
            window.electronAPI.exportarPDF(htmlCompleto);

        } catch (error) {
            console.error("Error al preparar los datos para el PDF:", error);
            alert("Ocurrió un error al preparar el PDF.");
        } finally {
            DOM.body.style.cursor = 'default';
        }
    } else {
        alert('La exportación a PDF solo está disponible en la aplicación de escritorio.');
        console.warn('La API de Electron no está disponible para exportar a PDF.');
    }
}

function configurarEventosModal() {
    DOM['btn-modal-cancelar'].addEventListener('click', () => {
        DOM['modal-advertencia'].style.display = 'none';
        estado.modalAbierto = false;
        estado.accionPendiente = null;
    });

    DOM['btn-modal-confirmar'].addEventListener('click', () => {
        DOM['modal-advertencia'].style.display = 'none';
        estado.modalAbierto = false;
        if (estado.accionPendiente) {
            estado.accionPendiente();
            estado.accionPendiente = null;
        }
    });
}

function mostrarModal(accion, tipo) {
    if (estado.modalAbierto) return;

    estado.modalAbierto = true;
    estado.accionPendiente = accion;

    let mensaje = "";
    switch (tipo) {
        case 'cerrar':
            mensaje = "Si sales ahora, perderás los cambios no guardados. ¿Deseas continuar?";
            break;
        case 'nuevo':
            mensaje = "Si creas un nuevo documento, perderás los cambios no guardados. ¿Deseas continuar?";
            break;
        case 'abrir':
            mensaje = "Si abres otro documento, perderás los cambios no guardados. ¿Deseas continuar?";
            break;
        default:
            mensaje = "Hay cambios sin guardar que se perderán si continúas.";
    }

    DOM['modal-mensaje'].textContent = mensaje;
    DOM['modal-advertencia'].style.display = 'flex';
}

function configurarEventosElectron() {
    if (window.electronAPI && typeof window.electronAPI.onSolicitudCierre === 'function') {
        window.electronAPI.onSolicitudCierre(() => {
            if (estado.documentoModificado && !estado.modalAbierto) {
                mostrarModal(() => {
                    window.electronAPI.forzarCierre();
                }, 'cerrar');
            } else {
                window.electronAPI.forzarCierre();
            }
        });
    }
}

function isElectron() {
    return window && window.process && window.process.type;
}

const funcionesMatematicas = {
    delimitadores: [
        {nombre: 'Paréntesis', comando: '\\left( x \\right)', ejemplo: '\\left( x \\right)'},
        {nombre: 'Corchetes', comando: '\\left[ x \\right]', ejemplo: '\\left[ x \\right]'},
        {nombre: 'Llaves', comando: '\\left\\{x \\right\\}', ejemplo: '\\left\\{x \\right\\}'},
        {nombre: 'Ángulos', comando: '\\langle x \\rangle', ejemplo: '\\langle x \\rangle'},
        {nombre: 'Barras verticales', comando: '\\lvert x \\rvert', ejemplo: '\\lvert x \\rvert'},
        {nombre: 'Norma', comando: '\\lVert x \\rVert', ejemplo: '\\lVert x \\rVert'},
        {nombre: 'Piso', comando: '\\lfloor x \\rfloor', ejemplo: '\\lfloor x \\rfloor'},
        {nombre: 'Techo', comando: '\\lceil x \\rceil', ejemplo: '\\lceil x \\rceil'},
        {nombre: 'Barra vertical simple', comando: '\\vert x \\vert', ejemplo: '\\vert x \\vert'},
        {nombre: 'Barra vertical doble', comando: '\\Vert x \\Vert', ejemplo: '\\Vert x \\Vert'},
        {nombre: 'Menor que', comando: '\\lt x \\gt', ejemplo: '\\lt x \\gt'},
        {nombre: 'Mayor que', comando: '\\lt x \\gt', ejemplo: '\\lt x \\gt'},
        {nombre: 'Dobles corchetes', comando: '\\llbracket x \\rrbracket', ejemplo: '\\llbracket x \\rrbracket'},
        {nombre: 'Flecha arriba', comando: '\\uparrow', ejemplo: '\\uparrow'},
        {nombre: 'Flecha abajo', comando: '\\downarrow', ejemplo: '\\downarrow'},
        {nombre: 'Flecha bidireccional vertical', comando: '\\updownarrow', ejemplo: '\\updownarrow'},
        {nombre: 'Flecha doble arriba', comando: '\\Uparrow', ejemplo: '\\Uparrow'},
        {nombre: 'Flecha doble abajo', comando: '\\Downarrow', ejemplo: '\\Downarrow'},
        {nombre: 'Flecha doble bidireccional', comando: '\\Updownarrow', ejemplo: '\\Updownarrow'},
        {nombre: 'Barra invertida', comando: '\\backslash', ejemplo: '\\backslash'},
        {nombre: 'Llaves grandes', comando: '\\lBrace x \\rBrace', ejemplo: '\\lBrace x \\rBrace'},
        {nombre: 'Paréntesis angulares alternativos', comando: '\\lang x \\rang', ejemplo: '\\lang x \\rang'},
        {nombre: 'Paréntesis alternativos', comando: '\\lparen x \\rparen', ejemplo: '\\lparen x \\rparen'},
        {nombre: 'Corchetes alternativos', comando: '\\lbrack x \\rbrack', ejemplo: '\\lbrack x \\rbrack'},
        {nombre: 'Llaves alternativas', comando: '\\lbrace x \\rbrace', ejemplo: '\\lbrace x \\rbrace'},
        {nombre: 'Delimitador invisible', comando: '\\left. x \\right|', ejemplo: '\\left. x \\right|'},
        {nombre: 'Techo Unicode', comando: '⌈ x ⌉', ejemplo: '⌈ x ⌉'},
        {nombre: 'Piso Unicode', comando: '⌊ x ⌋', ejemplo: '⌊ x ⌋'},
        {nombre: 'Llaves sistema Unicode', comando: '⎰ x ⎱', ejemplo: '⎰ x ⎱'},
        {nombre: 'Paréntesis redondeados Unicode', comando: '⟮ x ⟯', ejemplo: '⟮ x ⟯'},
        {nombre: 'Esquina superior izquierda', comando: '┌', ejemplo: '┌'},
        {nombre: 'Esquina superior derecha', comando: '┐', ejemplo: '┐'},
        {nombre: 'Esquina inferior izquierda', comando: '└', ejemplo: '└'},
        {nombre: 'Esquina inferior derecha', comando: '┘', ejemplo: '┘'},
        {nombre: 'Big', comando: '\\big( x \\big)', ejemplo: '\\big( x \\big)'},
        {nombre: 'Bigl', comando: '\\bigl( x \\bigr)', ejemplo: '\\bigl( x \\bigr)'},
        {nombre: 'Bigr', comando: '\\bigl( x \\bigr)', ejemplo: '\\bigl( x \\bigr)'},
        {nombre: 'Bigm', comando: '\\bigm| x \\bigm|', ejemplo: '\\bigm| x \\bigm|'},
        {nombre: 'Biggl', comando: '\\biggl( x \\biggr)', ejemplo: '\\biggl( x \\biggr)'},
        {nombre: 'Biggr', comando: '\\biggl( x \\biggr)', ejemplo: '\\biggl( x \\biggr)'},
        {nombre: 'Biggm', comando: '\\biggm| x \\biggm|', ejemplo: '\\biggm| x \\biggm|'},
        {nombre: 'Left', comando: '\\left( x \\right)', ejemplo: '\\left( x \\right)'},
        {nombre: 'Right', comando: '\\left( x \\right)', ejemplo: '\\left( x \\right)'},
        {nombre: 'Middle', comando: '\\left( x \\middle| y \\right)', ejemplo: '\\left( x \\middle| y \\right)'}
    ],
    entornos: [
        {nombre: 'Matriz (sin delimitadores)', comando: '\\begin{matrix}\n   a & b \\\\\n   c & d\n\\end{matrix}', ejemplo: '\\begin{matrix}\n   a & b \\\\\n   c & d\n\\end{matrix}'},
        {nombre: 'Arreglo', comando: '\\begin{array}{cc}\n   a & b \\\\\n   c & d\n\\end{array}', ejemplo: '\\begin{array}{cc}\n   a & b \\\\\n   c & d\n\\end{array}'},
        {nombre: 'Matriz entre paréntesis', comando: '\\begin{pmatrix}\n   a & b \\\\\n   c & d\n\\end{pmatrix}', ejemplo: '\\begin{pmatrix}\n   a & b \\\\\n   c & d\n\\end{pmatrix}'},
        {nombre: 'Matriz entre corchetes', comando: '\\begin{bmatrix}\n   a & b \\\\\n   c & d\n\\end{bmatrix}', ejemplo: '\\begin{bmatrix}\n   a & b \\\\\n   c & d\n\\end{bmatrix}'},
        {nombre: 'Determinante', comando: '\\begin{vmatrix}\n   a & b \\\\\n   c & d\n\\end{vmatrix}', ejemplo: '\\begin{vmatrix}\n   a & b \\\\\n   c & d\n\\end{vmatrix}'},
        {nombre: 'Norma', comando: '\\begin{Vmatrix}\n   a & b \\\\\n   c & d\n\\end{Vmatrix}', ejemplo: '\\begin{Vmatrix}\n   a & b \\\\\n   c & d\n\\end{Vmatrix}'},
        {nombre: 'Matriz entre llaves', comando: '\\begin{Bmatrix}\n   a & b \\\\\n   c & d\n\\end{Bmatrix}', ejemplo: '\\begin{Bmatrix}\n   a & b \\\\\n   c & d\n\\end{Bmatrix}'},
        {nombre: 'Tabla matemática', comando: '\\begin{array}{c:c:c}\n   a & b & c \\\\\n   \\hline\n   d & e & f \\\\\n   \\hdashline\n   g & h & i\n\\end{array}', ejemplo: '\\begin{array}{c:c:c}\n   a & b & c \\\\\n   \\hline\n   d & e & f \\\\\n   \\hdashline\n   g & h & i\n\\end{array}'},
        {nombre: 'Casos', comando: '\\begin{cases}\n   a & \\text{if } b \\\\\n   c & \\text{if } d\n\\end{cases}', ejemplo: '\\begin{cases}\n   a & \\text{if } b \\\\\n   c & \\text{if } d\n\\end{cases}'},
        {nombre: 'Casos con llaves a la derecha', comando: '\\begin{rcases}\n   a & \\text{if } b \\\\\n   c & \\text{if } d\n\\end{rcases}', ejemplo: '\\begin{rcases}\n   a & \\text{if } b \\\\\n   c & \\text{if } d\n\\end{rcases}'},
        {nombre: 'Matriz pequeña', comando: '\\begin{smallmatrix}\n   a & b \\\\\n   c & d\n\\end{smallmatrix}', ejemplo: '\\begin{smallmatrix}\n   a & b \\\\\n   c & d\n\\end{smallmatrix}'},
        {nombre: 'Subíndice multilínea', comando: '\\sum_{\\begin{subarray}{l}\n   i\\in\\Lambda \\\\\n   0<j<n\n\\end{subarray}}', ejemplo: '\\sum_{\\begin{subarray}{l}\n   i\\in\\Lambda \\\\\n   0<j<n\n\\end{subarray}}'}
    ],
    letras: [
        {nombre: 'Alfa mayúscula', comando: '\\Alpha', ejemplo: '\\Alpha'},
        {nombre: 'Beta mayúscula', comando: '\\Beta', ejemplo: '\\Beta'},
        {nombre: 'Gamma mayúscula', comando: '\\Gamma', ejemplo: '\\Gamma'},
        {nombre: 'Delta mayúscula', comando: '\\Delta', ejemplo: '\\Delta'},
        {nombre: 'Épsilon mayúscula', comando: '\\Epsilon', ejemplo: '\\Epsilon'},
        {nombre: 'Zeta mayúscula', comando: '\\Zeta', ejemplo: '\\Zeta'},
        {nombre: 'Eta mayúscula', comando: '\\Eta', ejemplo: '\\Eta'},
        {nombre: 'Theta mayúscula', comando: '\\Theta', ejemplo: '\\Theta'},
        {nombre: 'Iota mayúscula', comando: '\\Iota', ejemplo: '\\Iota'},
        {nombre: 'Kappa mayúscula', comando: '\\Kappa', ejemplo: '\\Kappa'},
        {nombre: 'Lambda mayúscula', comando: '\\Lambda', ejemplo: '\\Lambda'},
        {nombre: 'Mu mayúscula', comando: '\\Mu', ejemplo: '\\Mu'},
        {nombre: 'Nu mayúscula', comando: '\\Nu', ejemplo: '\\Nu'},
        {nombre: 'Xi mayúscula', comando: '\\Xi', ejemplo: '\\Xi'},
        {nombre: 'Ómicron mayúscula', comando: '\\Omicron', ejemplo: '\\Omicron'},
        {nombre: 'Pi mayúscula', comando: '\\Pi', ejemplo: '\\Pi'},
        {nombre: 'Rho mayúscula', comando: '\\Rho', ejemplo: '\\Rho'},
        {nombre: 'Sigma mayúscula', comando: '\\Sigma', ejemplo: '\\Sigma'},
        {nombre: 'Tau mayúscula', comando: '\\Tau', ejemplo: '\\Tau'},
        {nombre: 'Ípsilon mayúscula', comando: '\\Upsilon', ejemplo: '\\Upsilon'},
        {nombre: 'Fi mayúscula', comando: '\\Phi', ejemplo: '\\Phi'},
        {nombre: 'Ji mayúscula', comando: '\\Chi', ejemplo: '\\Chi'},
        {nombre: 'Psi mayúscula', comando: '\\Psi', ejemplo: '\\Psi'},
        {nombre: 'Omega mayúscula', comando: '\\Omega', ejemplo: '\\Omega'},
        {nombre: 'Gamma variante mayúscula', comando: '\\varGamma', ejemplo: '\\varGamma'},
        {nombre: 'Delta variante mayúscula', comando: '\\varDelta', ejemplo: '\\varDelta'},
        {nombre: 'Theta variante mayúscula', comando: '\\varTheta', ejemplo: '\\varTheta'},
        {nombre: 'Lambda variante mayúscula', comando: '\\varLambda', ejemplo: '\\varLambda'},
        {nombre: 'Xi variante mayúscula', comando: '\\varXi', ejemplo: '\\varXi'},
        {nombre: 'Pi variante mayúscula', comando: '\\varPi', ejemplo: '\\varPi'},
        {nombre: 'Sigma variante mayúscula', comando: '\\varSigma', ejemplo: '\\varSigma'},
        {nombre: 'Ípsilon variante mayúscula', comando: '\\varUpsilon', ejemplo: '\\varUpsilon'},
        {nombre: 'Fi variante mayúscula', comando: '\\varPhi', ejemplo: '\\varPhi'},
        {nombre: 'Psi variante mayúscula', comando: '\\varPsi', ejemplo: '\\varPsi'},
        {nombre: 'Omega variante mayúscula', comando: '\\varOmega', ejemplo: '\\varOmega'},
        {nombre: 'alfa minúscula', comando: '\\alpha', ejemplo: '\\alpha'},
        {nombre: 'beta minúscula', comando: '\\beta', ejemplo: '\\beta'},
        {nombre: 'gamma minúscula', comando: '\\gamma', ejemplo: '\\gamma'},
        {nombre: 'delta minúscula', comando: '\\delta', ejemplo: '\\delta'},
        {nombre: 'épsilon minúscula', comando: '\\epsilon', ejemplo: '\\epsilon'},
        {nombre: 'zeta minúscula', comando: '\\zeta', ejemplo: '\\zeta'},
        {nombre: 'eta minúscula', comando: '\\eta', ejemplo: '\\eta'},
        {nombre: 'theta minúscula', comando: '\\theta', ejemplo: '\\theta'},
        {nombre: 'iota minúscula', comando: '\\iota', ejemplo: '\\iota'},
        {nombre: 'kappa minúscula', comando: '\\kappa', ejemplo: '\\kappa'},
        {nombre: 'lambda minúscula', comando: '\\lambda', ejemplo: '\\lambda'},
        {nombre: 'mu minúscula', comando: '\\mu', ejemplo: '\\mu'},
        {nombre: 'nu minúscula', comando: '\\nu', ejemplo: '\\nu'},
        {nombre: 'xi minúscula', comando: '\\xi', ejemplo: '\\xi'},
        {nombre: 'ómicron minúscula', comando: '\\omicron', ejemplo: '\\omicron'},
        {nombre: 'pi minúscula', comando: '\\pi', ejemplo: '\\pi'},
        {nombre: 'rho minúscula', comando: '\\rho', ejemplo: '\\rho'},
        {nombre: 'sigma minúscula', comando: '\\sigma', ejemplo: '\\sigma'},
        {nombre: 'tau minúscula', comando: '\\tau', ejemplo: '\\tau'},
        {nombre: 'ípsilon minúscula', comando: '\\upsilon', ejemplo: '\\upsilon'},
        {nombre: 'fi minúscula', comando: '\\phi', ejemplo: '\\phi'},
        {nombre: 'ji minúscula', comando: '\\chi', ejemplo: '\\chi'},
        {nombre: 'psi minúscula', comando: '\\psi', ejemplo: '\\psi'},
        {nombre: 'omega minúscula', comando: '\\omega', ejemplo: '\\omega'},
        {nombre: 'épsilon variante minúscula', comando: '\\varepsilon', ejemplo: '\\varepsilon'},
        {nombre: 'kappa variante minúscula', comando: '\\varkappa', ejemplo: '\\varkappa'},
        {nombre: 'theta variante minúscula', comando: '\\vartheta', ejemplo: '\\vartheta'},
        {nombre: 'theta símbolo minúscula', comando: '\\thetasym', ejemplo: '\\thetasym'},
        {nombre: 'pi variante minúscula', comando: '\\varpi', ejemplo: '\\varpi'},
        {nombre: 'rho variante minúscula', comando: '\\varrho', ejemplo: '\\varrho'},
        {nombre: 'sigma final minúscula', comando: '\\varsigma', ejemplo: '\\varsigma'},
        {nombre: 'fi variante minúscula', comando: '\\varphi', ejemplo: '\\varphi'},
        {nombre: 'digamma minúscula', comando: '\\digamma', ejemplo: '\\digamma'},
        {nombre: 'i sin punto', comando: '\\imath', ejemplo: '\\imath'},
        {nombre: 'j sin punto', comando: '\\jmath', ejemplo: '\\jmath'},
        {nombre: 'Álef', comando: '\\aleph', ejemplo: '\\aleph'},
        {nombre: 'Álef alternativa', comando: '\\alef', ejemplo: '\\alef'},
        {nombre: 'Símbolo álef', comando: '\\alefsym', ejemplo: '\\alefsym'},
        {nombre: 'Bet', comando: '\\beth', ejemplo: '\\beth'},
        {nombre: 'Guímel', comando: '\\gimel', ejemplo: '\\gimel'},
        {nombre: 'Dálet', comando: '\\daleth', ejemplo: '\\daleth'},
        {nombre: 'Eth', comando: '\\eth', ejemplo: '\\eth'},
        {nombre: 'Nabla', comando: '\\nabla', ejemplo: '\\nabla'},
        {nombre: 'Derivada parcial', comando: '\\partial', ejemplo: '\\partial'},
        {nombre: 'Símbolo de juego', comando: '\\Game', ejemplo: '\\Game'},
        {nombre: 'Finv', comando: '\\Finv', ejemplo: '\\Finv'},
        {nombre: 'Números complejos', comando: '\\cnums', ejemplo: '\\cnums'},
        {nombre: 'Conjunto de números complejos', comando: '\\Complex', ejemplo: '\\Complex'},
        {nombre: 'Ele cursiva', comando: '\\ell', ejemplo: '\\ell'},
        {nombre: 'h barra', comando: '\\hbar', ejemplo: '\\hbar'},
        {nombre: 'h barra tachada', comando: '\\hslash', ejemplo: '\\hslash'},
        {nombre: 'Parte imaginaria', comando: '\\Im', ejemplo: '\\Im'},
        {nombre: 'Imagen', comando: '\\image', ejemplo: '\\image'},
        {nombre: 'k blackboard', comando: '\\Bbbk', ejemplo: '\\Bbbk'},
        {nombre: 'Números naturales', comando: '\\N', ejemplo: '\\N'},
        {nombre: 'Conjunto de números naturales', comando: '\\natnums', ejemplo: '\\natnums'},
        {nombre: 'Números reales', comando: '\\R', ejemplo: '\\R'},
        {nombre: 'Parte real', comando: '\\Re', ejemplo: '\\Re'},
        {nombre: 'Real', comando: '\\real', ejemplo: '\\real'},
        {nombre: 'Conjunto de números reales', comando: '\\reals', ejemplo: '\\reals'},
        {nombre: 'Conjunto de números reales alternativo', comando: '\\Reals', ejemplo: '\\Reals'},
        {nombre: 'p de Weierstrass', comando: '\\wp', ejemplo: '\\wp'},
        {nombre: 'Weierstrass p alternativo', comando: '\\weierp', ejemplo: '\\weierp'},
        {nombre: 'Números enteros', comando: '\\Z', ejemplo: '\\Z'},
        {nombre: 'a con anillo', comando: '\\text{\\aa}', ejemplo: '\\text{\\aa}'},
        {nombre: 'A con anillo', comando: '\\text{\\AA}', ejemplo: '\\text{\\AA}'},
        {nombre: 'Ligadura æ', comando: '\\text{\\ae}', ejemplo: '\\text{\\ae}'},
        {nombre: 'Ligadura Æ', comando: '\\text{\\AE}', ejemplo: '\\text{\\AE}'},
        {nombre: 'Ligadura œ', comando: '\\text{\\oe}', ejemplo: '\\text{\\oe}'},
        {nombre: 'Ligadura Œ', comando: '\\text{\\OE}', ejemplo: '\\text{\\OE}'},
        {nombre: 'o con barra', comando: '\\text{\\o}', ejemplo: '\\text{\\o}'},
        {nombre: 'O con barra', comando: '\\text{\\O}', ejemplo: '\\text{\\O}'},
        {nombre: 'Eszett', comando: '\\text{\\ss}', ejemplo: '\\text{\\ss}'},
        {nombre: 'i sin punto modo texto', comando: '\\text{\\i}', ejemplo: '\\text{\\i}'},
        {nombre: 'j sin punto modo texto', comando: '\\text{\\j}', ejemplo: '\\text{\\j}'}
    ],
    logica: [
        {nombre: 'Para todo', comando: '\\forall', ejemplo: '\\forall'},
        {nombre: 'Existe', comando: '\\exists', ejemplo: '\\exists'},
        {nombre: 'Existe alternativo', comando: '\\exist', ejemplo: '\\exist'},
        {nombre: 'No existe', comando: '\\nexists', ejemplo: '\\nexists'},
        {nombre: 'Pertenece a', comando: '\\in', ejemplo: '\\in'},
        {nombre: 'Pertenece a alternativo', comando: '\\isin', ejemplo: '\\isin'},
        {nombre: 'No pertenece a', comando: '\\notin', ejemplo: '\\notin'},
        {nombre: 'Complemento', comando: '\\complement', ejemplo: '\\complement'},
        {nombre: 'Subconjunto', comando: '\\subset', ejemplo: '\\subset'},
        {nombre: 'Superconjunto', comando: '\\supset', ejemplo: '\\supset'},
        {nombre: 'Tal que', comando: '\\mid', ejemplo: '\\mid'},
        {nombre: 'Y lógico', comando: '\\land', ejemplo: '\\land'},
        {nombre: 'O lógico', comando: '\\lor', ejemplo: '\\lor'},
        {nombre: 'Contiene a', comando: '\\ni', ejemplo: '\\ni'},
        {nombre: 'Por lo tanto', comando: '\\therefore', ejemplo: '\\therefore'},
        {nombre: 'Porque', comando: '\\because', ejemplo: '\\because'},
        {nombre: 'Asigna a', comando: '\\mapsto', ejemplo: '\\mapsto'},
        {nombre: 'Flecha derecha', comando: '\\to', ejemplo: '\\to'},
        {nombre: 'Flecha izquierda', comando: '\\gets', ejemplo: '\\gets'},
        {nombre: 'Flecha bidireccional', comando: '\\leftrightarrow', ejemplo: '\\leftrightarrow'},
        {nombre: 'No contiene a', comando: '\\notni', ejemplo: '\\notni'},
        {nombre: 'Conjunto vacío', comando: '\\emptyset', ejemplo: '\\emptyset'},
        {nombre: 'Conjunto vacío alternativo', comando: '\\empty', ejemplo: '\\empty'},
        {nombre: 'Conjunto vacío variante', comando: '\\varnothing', ejemplo: '\\varnothing'},
        {nombre: 'Implica', comando: '\\implies', ejemplo: '\\implies'},
        {nombre: 'Es implicado por', comando: '\\impliedby', ejemplo: '\\impliedby'},
        {nombre: 'Si y solo si', comando: '\\iff', ejemplo: '\\iff'},
        {nombre: 'Negación', comando: '\\neg', ejemplo: '\\neg'},
        {nombre: 'Negación alternativo', comando: '\\lnot', ejemplo: '\\lnot'},
        {nombre: 'Conjunto con formato', comando: '\\Set{x \\mid x<\\frac{1}{2}}', ejemplo: '\\Set{x \\mid x<\\frac{1}{2}}'},
        {nombre: 'Conjunto compacto', comando: '\\set{x\\mid x<5}', ejemplo: '\\set{x\\mid x<5}'},
        {nombre: 'Subconjunto o igual', comando: '\\subseteq', ejemplo: '\\subseteq'},
        {nombre: 'Superconjunto o igual', comando: '\\supseteq', ejemplo: '\\supseteq'},
        {nombre: 'Unión', comando: '\\cup', ejemplo: '\\cup'},
        {nombre: 'Unión disjunta', comando: '\\sqcup', ejemplo: '\\sqcup'},
        {nombre: 'Diferencia de conjuntos', comando: '\\setminus', ejemplo: '\\setminus'},
        {nombre: 'Producto cartesiano', comando: '\\times', ejemplo: '\\times'},
        {nombre: 'Conjunto potencia', comando: '\\mathcal{P}(X)', ejemplo: '\\mathcal{P}(X)'},
        {nombre: 'Cardinalidad', comando: '\\vert A \\vert', ejemplo: '\\vert A \\vert'},
        {nombre: 'Conjunto de números naturales', comando: '\\mathbb{N}', ejemplo: '\\mathbb{N}'},
        {nombre: 'Conjunto de números enteros', comando: '\\mathbb{Z}', ejemplo: '\\mathbb{Z}'},
        {nombre: 'Conjunto de números racionales', comando: '\\mathbb{Q}', ejemplo: '\\mathbb{Q}'},
        {nombre: 'Conjunto de números reales', comando: '\\mathbb{R}', ejemplo: '\\mathbb{R}'},
        {nombre: 'Conjunto de números complejos', comando: '\\mathbb{C}', ejemplo: '\\mathbb{C}'}
    ],
    operadores: [
        {nombre: 'Sumatoria', comando: '\\sum_{i=1}^n', ejemplo: '\\sum_{i=1}^n'},
        {nombre: 'Productorio', comando: '\\prod_{i=1}^n', ejemplo: '\\prod_{i=1}^n'},
        {nombre: 'Integral', comando: '\\int_a^b', ejemplo: '\\int_a^b'},
        {nombre: 'Integral doble', comando: '\\iint_D', ejemplo: '\\iint_D'},
        {nombre: 'Integral triple', comando: '\\iiint_V', ejemplo: '\\iiint_V'},
        {nombre: 'Integral cerrada', comando: '\\oint_C', ejemplo: '\\oint_C'},
        {nombre: 'Límite', comando: '\\lim_{x \\to 0}', ejemplo: '\\lim_{x \\to 0}'},
        {nombre: 'Máximo', comando: '\\max_{x \\in S}', ejemplo: '\\max_{x \\in S}'},
        {nombre: 'Mínimo', comando: '\\min_{x \\in S}', ejemplo: '\\min_{x \\in S}'},
        {nombre: 'Infimo', comando: '\\inf_{x \\in S}', ejemplo: '\\inf_{x \\in S}'},
        {nombre: 'Supremo', comando: '\\sup_{x \\in S}', ejemplo: '\\sup_{x \\in S}'},
        {nombre: 'Más menos', comando: '\\pm', ejemplo: '\\pm'},
        {nombre: 'Menos más', comando: '\\mp', ejemplo: '\\mp'},
        {nombre: 'Multiplicación', comando: '\\times', ejemplo: '\\times'},
        {nombre: 'División', comando: '\\div', ejemplo: '\\div'},
        {nombre: 'Operador asterisco', comando: '\\ast', ejemplo: '\\ast'},
        {nombre: 'Operador estrella', comando: '\\star', ejemplo: '\\star'},
        {nombre: 'Operador bullet', comando: '\\bullet', ejemplo: '\\bullet'},
        {nombre: 'Operador cdot', comando: '\\cdot', ejemplo: '\\cdot'},
        {nombre: 'Circ', comando: '\\circ', ejemplo: '\\circ'},
        {nombre: 'Bigcirc', comando: '\\bigcirc', ejemplo: '\\bigcirc'},
        {nombre: 'Infinito', comando: '\\infty', ejemplo: '\\infty'},
        {nombre: 'Nabla', comando: '\\nabla', ejemplo: '\\nabla'},
        {nombre: 'Parcial', comando: '\\partial', ejemplo: '\\partial'},
        {nombre: 'Para todo', comando: '\\forall', ejemplo: '\\forall'},
        {nombre: 'Existe', comando: '\\exists', ejemplo: '\\exists'},
        {nombre: 'No existe', comando: '\\nexists', ejemplo: '\\nexists'},
        {nombre: 'Vacío', comando: '\\emptyset', ejemplo: '\\emptyset'},
        {nombre: 'Varnothing', comando: '\\varnothing', ejemplo: '\\varnothing'},
        {nombre: 'Daga', comando: '\\dag', ejemplo: '\\dag'},
        {nombre: 'Daga doble', comando: '\\ddag', ejemplo: '\\ddag'},
        {nombre: 'Dagger', comando: '\\dagger', ejemplo: '\\dagger'},
        {nombre: 'Dagger doble', comando: '\\ddagger', ejemplo: '\\ddagger'},
        {nombre: 'Seno', comando: '\\sin', ejemplo: '\\sin'},
        {nombre: 'Coseno', comando: '\\cos', ejemplo: '\\cos'},
        {nombre: 'Tangente', comando: '\\tan', ejemplo: '\\tan'},
        {nombre: 'Logaritmo', comando: '\\log', ejemplo: '\\log'},
        {nombre: 'Logaritmo natural', comando: '\\ln', ejemplo: '\\ln'},
        {nombre: 'Exponencial', comando: '\\exp', ejemplo: '\\exp'},
        {nombre: 'Grado', comando: '\\degree', ejemplo: '\\degree'},
        {nombre: 'Texto', comando: '\\text{texto}', ejemplo: '\\text{texto}'},
        {nombre: 'Flecha', comando: '\\to', ejemplo: '\\to'},
        {nombre: 'Derecha', comando: '\\rightarrow', ejemplo: '\\rightarrow'},
        {nombre: 'Izquierda', comando: '\\leftarrow', ejemplo: '\\leftarrow'},
        {nombre: 'Implica', comando: '\\Rightarrow', ejemplo: '\\Rightarrow'},
        {nombre: 'Equivalente', comando: '\\Leftrightarrow', ejemplo: '\\Leftrightarrow'},
        {nombre: 'Mapea a', comando: '\\mapsto', ejemplo: '\\mapsto'},
        {nombre: 'Arriba', comando: '\\uparrow', ejemplo: '\\uparrow'},
        {nombre: 'Abajo', comando: '\\downarrow', ejemplo: '\\downarrow'},
        {nombre: 'Doble arriba', comando: '\\Uparrow', ejemplo: '\\Uparrow'},
        {nombre: 'Doble abajo', comando: '\\Downarrow', ejemplo: '\\Downarrow'},
        {nombre: 'Bidireccional', comando: '\\updownarrow', ejemplo: '\\updownarrow'},
        {nombre: 'Doble bidireccional', comando: '\\Updownarrow', ejemplo: '\\Updownarrow'},
        {nombre: 'Noreste', comando: '\\nearrow', ejemplo: '\\nearrow'},
        {nombre: 'Noroeste', comando: '\\nwarrow', ejemplo: '\\nwarrow'},
        {nombre: 'Sureste', comando: '\\searrow', ejemplo: '\\searrow'},
        {nombre: 'Suroeste', comando: '\\swarrow', ejemplo: '\\swarrow'},
        {nombre: 'Leftrightarrow', comando: '\\leftrightarrow', ejemplo: '\\leftrightarrow'},
        {nombre: 'Longleftrightarrow', comando: '\\longleftrightarrow', ejemplo: '\\longleftrightarrow'},
        {nombre: 'Longleftarrow', comando: '\\longleftarrow', ejemplo: '\\longleftarrow'},
        {nombre: 'Longrightarrow', comando: '\\longrightarrow', ejemplo: '\\longrightarrow'},
        {nombre: 'Coproducto', comando: '\\coprod_{i=1}^n', ejemplo: '\\coprod_{i=1}^n'},
        {nombre: 'Integral (operador)', comando: '\\intop_a^b', ejemplo: '\\intop_a^b'},
        {nombre: 'Integral pequeña', comando: '\\smallint', ejemplo: '\\smallint'},
        {nombre: 'Integral de contorno', comando: '\\oint_C', ejemplo: '\\oint_C'},
        {nombre: 'Integral de superficie', comando: '\\oiint_S', ejemplo: '\\oiint_S'},
        {nombre: 'Integral de volumen', comando: '\\oiiint_V', ejemplo: '\\oiiint_V'},
        {nombre: 'Producto tensorial', comando: '\\bigotimes_{i=1}^n', ejemplo: '\\bigotimes_{i=1}^n'},
        {nombre: 'Suma directa', comando: '\\bigoplus_{i=1}^n', ejemplo: '\\bigoplus_{i=1}^n'},
        {nombre: 'Producto Hadamard', comando: '\\bigodot_{i=1}^n', ejemplo: '\\bigodot_{i=1}^n'},
        {nombre: 'Disyunción generalizada', comando: '\\bigvee_{i=1}^n', ejemplo: '\\bigvee_{i=1}^n'},
        {nombre: 'Conjunción generalizada', comando: '\\bigwedge_{i=1}^n', ejemplo: '\\bigwedge_{i=1}^n'},
        {nombre: 'Intersección', comando: '\\bigcap_{i=1}^n', ejemplo: '\\bigcap_{i=1}^n'},
        {nombre: 'Unión', comando: '\\bigcup_{i=1}^n', ejemplo: '\\bigcup_{i=1}^n'},
        {nombre: 'Unión disjunta', comando: '\\biguplus_{i=1}^n', ejemplo: '\\biguplus_{i=1}^n'},
        {nombre: 'Unión disjunta (con cuadrado)', comando: '\\bigsqcup_{i=1}^n', ejemplo: '\\bigsqcup_{i=1}^n'},
        {nombre: 'Más', comando: '+', ejemplo: '+'},
        {nombre: 'Menos', comando: '-', ejemplo: '-'},
        {nombre: 'División', comando: '/', ejemplo: '/'},
        {nombre: 'Asterisco', comando: '*', ejemplo: '*'},
        {nombre: 'Amalgama', comando: '\\amalg', ejemplo: '\\amalg'},
        {nombre: 'Y comercial', comando: '\\And', ejemplo: '\\And'},
        {nombre: 'Asterisco', comando: '\\ast', ejemplo: '\\ast'},
        {nombre: 'Barra cuña', comando: '\\barwedge', ejemplo: '\\barwedge'},
        {nombre: 'Círculo grande', comando: '\\bigcirc', ejemplo: '\\bigcirc'},
        {nombre: 'Módulo binario', comando: '\\bmod', ejemplo: '\\bmod'},
        {nombre: 'Caja con punto', comando: '\\boxdot', ejemplo: '\\boxdot'},
        {nombre: 'Caja con menos', comando: '\\boxminus', ejemplo: '\\boxminus'},
        {nombre: 'Caja con más', comando: '\\boxplus', ejemplo: '\\boxplus'},
        {nombre: 'Caja con por', comando: '\\boxtimes', ejemplo: '\\boxtimes'},
        {nombre: 'Punto', comando: '\\bullet', ejemplo: '\\bullet'},
        {nombre: 'Doble intersección', comando: '\\Cap', ejemplo: '\\Cap'},
        {nombre: 'Intersección', comando: '\\cap', ejemplo: '\\cap'},
        {nombre: 'Punto centrado', comando: '\\cdot', ejemplo: '\\cdot'},
        {nombre: 'Punto centrado alternativo', comando: '\\cdotp', ejemplo: '\\cdotp'},
        {nombre: 'Punto centrado variante', comando: '\\centerdot', ejemplo: '\\centerdot'},
        {nombre: 'Círculo', comando: '\\circ', ejemplo: '\\circ'},
        {nombre: 'Círculo con asterisco', comando: '\\circledast', ejemplo: '\\circledast'},
        {nombre: 'Círculo con círculo', comando: '\\circledcirc', ejemplo: '\\circledcirc'},
        {nombre: 'Círculo con guion', comando: '\\circleddash', ejemplo: '\\circleddash'},
        {nombre: 'Doble unión', comando: '\\Cup', ejemplo: '\\Cup'},
        {nombre: 'Unión', comando: '\\cup', ejemplo: '\\cup'},
        {nombre: 'Llave curva', comando: '\\curlyvee', ejemplo: '\\curlyvee'},
        {nombre: 'Cuña curva', comando: '\\curlywedge', ejemplo: '\\curlywedge'},
        {nombre: 'División', comando: '\\div', ejemplo: '\\div'},
        {nombre: 'Dividido por', comando: '\\divideontimes', ejemplo: '\\divideontimes'},
        {nombre: 'Punto más', comando: '\\dotplus', ejemplo: '\\dotplus'},
        {nombre: 'Doble barra cuña', comando: '\\doublebarwedge', ejemplo: '\\doublebarwedge'},
        {nombre: 'Doble intersección', comando: '\\doublecap', ejemplo: '\\doublecap'},
        {nombre: 'Doble unión', comando: '\\doublecup', ejemplo: '\\doublecup'},
        {nombre: 'Mayor con punto', comando: '\\gtrdot', ejemplo: '\\gtrdot'},
        {nombre: 'Intercalación', comando: '\\intercal', ejemplo: '\\intercal'},
        {nombre: 'Y lógico', comando: '\\land', ejemplo: '\\land'},
        {nombre: 'Tres tiempos izquierdos', comando: '\\leftthreetimes', ejemplo: '\\leftthreetimes'},
        {nombre: 'Punto', comando: '\\ldotp', ejemplo: '\\ldotp'},
        {nombre: 'O lógico', comando: '\\lor', ejemplo: '\\lor'},
        {nombre: 'Menor con punto', comando: '\\lessdot', ejemplo: '\\lessdot'},
        {nombre: 'Triángulo izquierdo', comando: '\\lhd', ejemplo: '\\lhd'},
        {nombre: 'Semiproducto izquierdo', comando: '\\ltimes', ejemplo: '\\ltimes'},
        {nombre: 'Módulo', comando: 'x \\mod a', ejemplo: 'x \\mod a'},
        {nombre: 'Menos más', comando: '\\mp', ejemplo: '\\mp'},
        {nombre: 'Punto círculo', comando: '\\odot', ejemplo: '\\odot'},
        {nombre: 'Menos círculo', comando: '\\ominus', ejemplo: '\\ominus'},
        {nombre: 'Más círculo', comando: '\\oplus', ejemplo: '\\oplus'},
        {nombre: 'Por círculo', comando: '\\otimes', ejemplo: '\\otimes'},
        {nombre: 'División círculo', comando: '\\oslash', ejemplo: '\\oslash'},
        {nombre: 'Más menos', comando: '\\pm', ejemplo: '\\pm'},
        {nombre: 'Más menos alternativo', comando: '\\plusmn', ejemplo: '\\plusmn'},
        {nombre: 'Módulo con paréntesis', comando: 'x \\pmod a', ejemplo: 'x \\pmod a'},
        {nombre: 'Módulo compacto', comando: 'x \\pod a', ejemplo: 'x \\pod a'},
        {nombre: 'Triángulo derecho', comando: '\\rhd', ejemplo: '\\rhd'},
        {nombre: 'Tres tiempos derechos', comando: '\\rightthreetimes', ejemplo: '\\rightthreetimes'},
        {nombre: 'Semiproducto derecho', comando: '\\rtimes', ejemplo: '\\rtimes'},
        {nombre: 'Diferencia de conjuntos', comando: '\\setminus', ejemplo: '\\setminus'},
        {nombre: 'Diferencia pequeña', comando: '\\smallsetminus', ejemplo: '\\smallsetminus'},
        {nombre: 'Intersección cuadrada', comando: '\\sqcap', ejemplo: '\\sqcap'},
        {nombre: 'Unión cuadrada', comando: '\\sqcup', ejemplo: '\\sqcup'},
        {nombre: 'Por', comando: '\\times', ejemplo: '\\times'},
        {nombre: 'Subnormal o igual', comando: '\\unlhd', ejemplo: '\\unlhd'},
        {nombre: 'Supernormal o igual', comando: '\\unrhd', ejemplo: '\\unrhd'},
        {nombre: 'Unión disjunta', comando: '\\uplus', ejemplo: '\\uplus'},
        {nombre: 'O', comando: '\\vee', ejemplo: '\\vee'},
        {nombre: 'O exclusivo', comando: '\\veebar', ejemplo: '\\veebar'},
        {nombre: 'Y', comando: '\\wedge', ejemplo: '\\wedge'},
        {nombre: 'Producto corona', comando: '\\wr', ejemplo: '\\wr'},
        {nombre: 'Fracción', comando: '\\frac{a}{b}', ejemplo: '\\frac{a}{b}'},
        {nombre: 'Fracción alternativa', comando: '{a \\over b}', ejemplo: '{a \\over b}'},
        {nombre: 'Barra de fracción', comando: 'a/b', ejemplo: 'a/b'},
        {nombre: 'Fracción de texto', comando: '\\tfrac{a}{b}', ejemplo: '\\tfrac{a}{b}'},
        {nombre: 'Fracción de display', comando: '\\dfrac{a}{b}', ejemplo: '\\dfrac{a}{b}'},
        {nombre: 'Fracción generalizada', comando: '\\genfrac ( ] {2pt}{1}a{a+1}', ejemplo: '\\genfrac ( ] {2pt}{1}a{a+1}'},
        {nombre: 'Fracción con línea personalizada', comando: '{a \\above{2pt} b+1}', ejemplo: '{a \\above{2pt} b+1}'},
        {nombre: 'Fracción continua', comando: '\\cfrac{a}{1 + \\cfrac{1}{b}}', ejemplo: '\\cfrac{a}{1 + \\cfrac{1}{b}}'},
        {nombre: 'Coeficiente binomial', comando: '\\binom{n}{k}', ejemplo: '\\binom{n}{k}'},
        {nombre: 'Coeficiente binomial alternativo', comando: '{n \\choose k}', ejemplo: '{n \\choose k}'},
        {nombre: 'Coeficiente binomial de display', comando: '\\dbinom{n}{k}', ejemplo: '\\dbinom{n}{k}'},
        {nombre: 'Coeficiente binomial de texto', comando: '\\tbinom{n}{k}', ejemplo: '\\tbinom{n}{k}'},
        {nombre: 'Números de Stirling de segundo tipo', comando: '{n\\brace k}', ejemplo: '{n\\brace k}'},
        {nombre: 'Números de Stirling de primer tipo', comando: '{n\\brack k}', ejemplo: '{n\\brack k}'},
        {nombre: 'Arcoseno', comando: '\\arcsin x', ejemplo: '\\arcsin x'},
        {nombre: 'Arcocoseno', comando: '\\arccos x', ejemplo: '\\arccos x'},
        {nombre: 'Arcotangente', comando: '\\arctan x', ejemplo: '\\arctan x'},
        {nombre: 'Arcotangente alternativa', comando: '\\arctg x', ejemplo: '\\arctg x'},
        {nombre: 'Arcocotangente', comando: '\\arcctg x', ejemplo: '\\arcctg x'},
        {nombre: 'Argumento', comando: '\\arg z', ejemplo: '\\arg z'},
        {nombre: 'Coseno hiperbólico alternativo', comando: '\\ch x', ejemplo: '\\ch x'},
        {nombre: 'Coseno', comando: '\\cos x', ejemplo: '\\cos x'},
        {nombre: 'Cosecante', comando: '\\cosec x', ejemplo: '\\cosec x'},
        {nombre: 'Coseno hiperbólico', comando: '\\cosh x', ejemplo: '\\cosh x'},
        {nombre: 'Cotangente', comando: '\\cot x', ejemplo: '\\cot x'},
        {nombre: 'Cotangente alternativa', comando: '\\cotg x', ejemplo: '\\cotg x'},
        {nombre: 'Cotangente hiperbólica', comando: '\\coth x', ejemplo: '\\coth x'},
        {nombre: 'Cosecante alternativa', comando: '\\csc x', ejemplo: '\\csc x'},
        {nombre: 'Cotangente alternativa', comando: '\\ctg x', ejemplo: '\\ctg x'},
        {nombre: 'Cotangente hiperbólica alternativa', comando: '\\cth x', ejemplo: '\\cth x'},
        {nombre: 'Grado', comando: '\\deg f', ejemplo: '\\deg f'},
        {nombre: 'Dimensión', comando: '\\dim V', ejemplo: '\\dim V'},
        {nombre: 'Función exponencial', comando: '\\exp x', ejemplo: '\\exp x'},
        {nombre: 'Homomorfismo', comando: '\\hom(G,H)', ejemplo: '\\hom(G,H)'},
        {nombre: 'Núcleo', comando: '\\ker T', ejemplo: '\\ker T'},
        {nombre: 'Logaritmo en base 10', comando: '\\lg x', ejemplo: '\\lg x'},
        {nombre: 'Logaritmo natural', comando: '\\ln x', ejemplo: '\\ln x'},
        {nombre: 'Logaritmo', comando: '\\log x', ejemplo: '\\log x'},
        {nombre: 'Secante', comando: '\\sec x', ejemplo: '\\sec x'},
        {nombre: 'Seno', comando: '\\sin x', ejemplo: '\\sin x'},
        {nombre: 'Seno hiperbólico', comando: '\\sinh x', ejemplo: '\\sinh x'},
        {nombre: 'Seno hiperbólico alternativo', comando: '\\sh x', ejemplo: '\\sh x'},
        {nombre: 'Tangente', comando: '\\tan x', ejemplo: '\\tan x'},
        {nombre: 'Tangente hiperbólica', comando: '\\tanh x', ejemplo: '\\tanh x'},
        {nombre: 'Tangente alternativa', comando: '\\tg x', ejemplo: '\\tg x'},
        {nombre: 'Tangente hiperbólica alternativa', comando: '\\th x', ejemplo: '\\th x'},
        {nombre: 'Función f', comando: '\\operatorname{f}(x)', ejemplo: '\\operatorname{f}(x)'},
        {nombre: 'Función f con límites', comando: '\\operatorname*{f}', ejemplo: '\\operatorname*{f}'},
        {nombre: 'Función f con límites alternativa', comando: '\\operatornamewithlimits{f}', ejemplo: '\\operatornamewithlimits{f}'},
        {nombre: 'Argumento del máximo', comando: '\\argmax_x f(x)', ejemplo: '\\argmax_x f(x)'},
        {nombre: 'Argumento del mínimo', comando: '\\argmin_x f(x)', ejemplo: '\\argmin_x f(x)'},
        {nombre: 'Determinante', comando: '\\det A', ejemplo: '\\det A'},
        {nombre: 'Máximo común divisor', comando: '\\gcd(a,b)', ejemplo: '\\gcd(a,b)'},
        {nombre: 'Ínfimo', comando: '\\inf S', ejemplo: '\\inf S'},
        {nombre: 'Límite directo', comando: '\\injlim', ejemplo: '\\injlim'},
        {nombre: 'Límite', comando: '\\lim_{x\\to a} f(x)', ejemplo: '\\lim_{x\\to a} f(x)'},
        {nombre: 'Límite inferior', comando: '\\liminf_{n\\to\\infty} a_n', ejemplo: '\\liminf_{n\\to\\infty} a_n'},
        {nombre: 'Límite superior', comando: '\\limsup_{n\\to\\infty} a_n', ejemplo: '\\limsup_{n\\to\\infty} a_n'},
        {nombre: 'Máximo', comando: '\\max S', ejemplo: '\\max S'},
        {nombre: 'Mínimo', comando: '\\min S', ejemplo: '\\min S'},
        {nombre: 'Límite en probabilidad', comando: '\\plim', ejemplo: '\\plim'},
        {nombre: 'Probabilidad', comando: '\\Pr(X=x)', ejemplo: '\\Pr(X=x)'},
        {nombre: 'Límite inverso', comando: '\\projlim', ejemplo: '\\projlim'},
        {nombre: 'Supremo', comando: '\\sup S', ejemplo: '\\sup S'},
        {nombre: 'Límite directo variante', comando: '\\varinjlim', ejemplo: '\\varinjlim'},
        {nombre: 'Límite inferior variante', comando: '\\varliminf', ejemplo: '\\varliminf'},
        {nombre: 'Límite superior variante', comando: '\\varlimsup', ejemplo: '\\varlimsup'},
        {nombre: 'Límite inverso variante', comando: '\\varprojlim', ejemplo: '\\varprojlim'},
        {nombre: 'Raíz cuadrada', comando: '\\sqrt{x}', ejemplo: '\\sqrt{x}'},
        {nombre: 'Raíz cúbica', comando: '\\sqrt[3]{x}', ejemplo: '\\sqrt[3]{x}'}
    ],
    especiales: [
        {nombre: 'Bra de φ', comando: '\\bra{\\phi}', ejemplo: '\\bra{\\phi}'},
        {nombre: 'Bra escalable de φ', comando: '\\Bra{\\phi}', ejemplo: '\\Bra{\\phi}'},
        {nombre: 'Ket de ψ', comando: '\\ket{\\psi}', ejemplo: '\\ket{\\psi}'},
        {nombre: 'Ket escalable de ψ', comando: '\\Ket{\\psi}', ejemplo: '\\Ket{\\psi}'},
        {nombre: 'Producto interno de φ y ψ', comando: '\\braket{\\phi\\mid\\psi}', ejemplo: '\\braket{\\phi\\mid\\psi}'},
        {nombre: 'Elemento de matriz de ∂²/∂t² entre φ y ψ', comando: '\\Braket{\\phi \\mid \\frac{\\partial^2}{\\partial t^2} \\mid \\psi }', ejemplo: '\\Braket{\\phi \\mid \\frac{\\partial^2}{\\partial t^2} \\mid \\psi }'},
        {nombre: 'Valor esperado', comando: '\\langle \\psi | A | \\psi \\rangle', ejemplo: '\\langle \\psi | A | \\psi \\rangle'},
        {nombre: 'Traza', comando: '\\operatorname{Tr}(A)', ejemplo: '\\operatorname{Tr}(A)'},
        {nombre: 'Producto exterior', comando: 'v \\wedge w', ejemplo: 'v \\wedge w'},
        {nombre: 'Producto escalar', comando: '\\vec{a} \\cdot \\vec{b}', ejemplo: '\\vec{a} \\cdot \\vec{b}'},
        {nombre: 'Producto vectorial', comando: '\\vec{a} \\times \\vec{b}', ejemplo: '\\vec{a} \\times \\vec{b}'},
        {nombre: 'Daga (adjunto)', comando: 'A^\\dagger', ejemplo: 'A^\\dagger'},
        {nombre: 'Estrella (conjugado complejo)', comando: 'z^*', ejemplo: 'z^*'},
        {nombre: 'Transpuesta', comando: 'A^{T}', ejemplo: 'A^{T}'},
        {nombre: 'Norma', comando: '\\| x \\|', ejemplo: '\\| x \\|'},
        {nombre: 'Producto punto', comando: '\\vec{a} \\bullet \\vec{b}', ejemplo: '\\vec{a} \\bullet \\vec{b}'},
        {nombre: 'Gradiente', comando: '\\nabla f', ejemplo: '\\nabla f'},
        {nombre: 'Divergencia', comando: '\\nabla \\cdot \\vec{F}', ejemplo: '\\nabla \\cdot \\vec{F}'},
        {nombre: 'Rotacional', comando: '\\nabla \\times \\vec{F}', ejemplo: '\\nabla \\times \\vec{F}'},
        {nombre: 'Laplaciano', comando: '\\nabla^2 f', ejemplo: '\\nabla^2 f'},
        {nombre: 'Delta de Kronecker', comando: '\\delta_{ij}', ejemplo: '\\delta_{ij}'},
        {nombre: 'Símbolo de Levi-Civita', comando: '\\varepsilon_{ijk}', ejemplo: '\\varepsilon_{ijk}'},
        {nombre: 'Función delta de Dirac', comando: '\\delta(x)', ejemplo: '\\delta(x)'},
        {nombre: 'Función escalón de Heaviside', comando: 'H(x)', ejemplo: 'H(x)'},
        {nombre: 'Transformada de Fourier', comando: '\\mathcal{F}\\{f(t)\\}', ejemplo: '\\mathcal{F}\\{f(t)\\}'},
        {nombre: 'Transformada de Laplace', comando: '\\mathcal{L}\\{f(t)\\}', ejemplo: '\\mathcal{L}\\{f(t)\\}'}
    ],
    estilos: [
        {nombre: 'Color azul', comando: '\\color{blue} F=ma', ejemplo: '\\color{blue} F=ma'},
        {nombre: 'Texto azul', comando: '\\textcolor{blue}{F=ma}', ejemplo: '\\textcolor{blue}{F=ma}'},
        {nombre: 'Color hexadecimal', comando: '\\textcolor{#228B22}{F=ma}', ejemplo: '\\textcolor{#228B22}{F=ma}'},
        {nombre: 'Caja de color aqua', comando: '\\colorbox{aqua}{$F=ma$}', ejemplo: '\\colorbox{aqua}{$F=ma$}'},
        {nombre: 'Caja con borde rojo', comando: '\\fcolorbox{red}{aqua}{$F=ma$}', ejemplo: '\\fcolorbox{red}{aqua}{$F=ma$}'},
        {nombre: 'Fuente romana', comando: '\\mathrm{Ab0}', ejemplo: '\\mathrm{Ab0}'},
        {nombre: 'Fuente normal', comando: '\\mathnormal{Ab0}', ejemplo: '\\mathnormal{Ab0}'},
        {nombre: 'Texto romano', comando: '\\textrm{Ab0}', ejemplo: '\\textrm{Ab0}'},
        {nombre: 'Fuente romana abreviado', comando: '\\rm Ab0', ejemplo: '\\rm Ab0'},
        {nombre: 'Texto normal', comando: '\\textnormal{Ab0}', ejemplo: '\\textnormal{Ab0}'},
        {nombre: 'Texto', comando: '\\text{Ab0}', ejemplo: '\\text{Ab0}'},
        {nombre: 'Texto vertical', comando: '\\textup{Ab0}', ejemplo: '\\textup{Ab0}'},
        {nombre: 'Cursiva matemática', comando: '\\mathit{Ab0}', ejemplo: '\\mathit{Ab0}'},
        {nombre: 'Cursiva texto', comando: '\\textit{Ab0}', ejemplo: '\\textit{Ab0}'},
        {nombre: 'Cursiva abreviado', comando: '\\it Ab0', ejemplo: '\\it Ab0'},
        {nombre: 'Negrita matemática', comando: '\\mathbf{Ab0}', ejemplo: '\\mathbf{Ab0}'},
        {nombre: 'Negrita texto', comando: '\\textbf{Ab0}', ejemplo: '\\textbf{Ab0}'},
        {nombre: 'Negrita abreviado', comando: '\\bf Ab0', ejemplo: '\\bf Ab0'},
        {nombre: 'Negrita alternativo', comando: '\\bold{Ab0}', ejemplo: '\\bold{Ab0}'},
        {nombre: 'Negrita símbolos', comando: '\\boldsymbol{Ab0}', ejemplo: '\\boldsymbol{Ab0}'},
        {nombre: 'Negrita bm', comando: '\\bm{Ab0}', ejemplo: '\\bm{Ab0}'},
        {nombre: 'Peso medio', comando: '\\textmd{Ab0}', ejemplo: '\\textmd{Ab0}'},
        {nombre: 'Tipo máquina matemática', comando: '\\mathtt{Ab0}', ejemplo: '\\mathtt{Ab0}'},
        {nombre: 'Tipo máquina texto', comando: '\\texttt{Ab0}', ejemplo: '\\texttt{Ab0}'},
        {nombre: 'Tipo máquina abreviado', comando: '\\tt Ab0', ejemplo: '\\tt Ab0'},
        {nombre: 'Sans serif matemática', comando: '\\mathsf{Ab0}', ejemplo: '\\mathsf{Ab0}'},
        {nombre: 'Sans serif texto', comando: '\\textsf{Ab0}', ejemplo: '\\textsf{Ab0}'},
        {nombre: 'Sans serif abreviado', comando: '\\sf Ab0', ejemplo: '\\sf Ab0'},
        {nombre: 'Pizarra abreviado', comando: '\\Bbb{AB}', ejemplo: '\\Bbb{AB}'},
        {nombre: 'Pizarra blackboard', comando: '\\mathbb{AB}', ejemplo: '\\mathbb{AB}'},
        {nombre: 'Gótica abreviado', comando: '\\frak{Ab0}', ejemplo: '\\frak{Ab0}'},
        {nombre: 'Gótica fraktur', comando: '\\mathfrak{Ab0}', ejemplo: '\\mathfrak{Ab0}'},
        {nombre: 'Caligráfica', comando: '\\mathcal{AB0}', ejemplo: '\\mathcal{AB0}'},
        {nombre: 'Caligráfica abreviado', comando: '\\cal AB0', ejemplo: '\\cal AB0'},
        {nombre: 'Script manuscrita', comando: '\\mathscr{AB}', ejemplo: '\\mathscr{AB}'},
        {nombre: 'Tamaño gigante', comando: '\\Huge AB', ejemplo: '\\Huge AB'},
        {nombre: 'Tamaño enorme', comando: '\\huge AB', ejemplo: '\\huge AB'},
        {nombre: 'Tamaño muy grande', comando: '\\LARGE AB', ejemplo: '\\LARGE AB'},
        {nombre: 'Tamaño mayor', comando: '\\Large AB', ejemplo: '\\Large AB'},
        {nombre: 'Tamaño grande', comando: '\\large AB', ejemplo: '\\large AB'},
        {nombre: 'Tamaño normal', comando: '\\normalsize AB', ejemplo: '\\normalsize AB'},
        {nombre: 'Tamaño pequeño', comando: '\\small AB', ejemplo: '\\small AB'},
        {nombre: 'Tamaño pie de página', comando: '\\footnotesize AB', ejemplo: '\\footnotesize AB'},
        {nombre: 'Tamaño muy pequeño', comando: '\\scriptsize AB', ejemplo: '\\scriptsize AB'},
        {nombre: 'Tamaño diminuto', comando: '\\tiny AB', ejemplo: '\\tiny AB'},
        {nombre: 'Estilo display', comando: '\\displaystyle\\sum_{i=1}^n', ejemplo: '\\displaystyle\\sum_{i=1}^n'},
        {nombre: 'Estilo texto', comando: '\\textstyle\\sum_{i=1}^n', ejemplo: '\\textstyle\\sum_{i=1}^n'},
        {nombre: 'Estilo script', comando: '\\scriptstyle x', ejemplo: '\\scriptstyle x'},
        {nombre: 'Estilo script de script', comando: '\\scriptscriptstyle x', ejemplo: '\\scriptscriptstyle x'},
        {nombre: 'Límites debajo y arriba', comando: '\\lim\\limits_x', ejemplo: '\\lim\\limits_x'},
        {nombre: 'Límites al lado', comando: '\\lim\\nolimits_x', ejemplo: '\\lim\\nolimits_x'},
        {nombre: 'Texto verbatim', comando: '\\verb!x^2!', ejemplo: '\\verb!x^2!'}
    ],
    puntuacion: [
        {nombre: 'Signo de porcentaje', comando: '\\%', ejemplo: '\\%'},
        {nombre: 'Almohadilla', comando: '\\#', ejemplo: '\\#'},
        {nombre: 'Et (ampersand)', comando: '\\&', ejemplo: '\\&'},
        {nombre: 'Guion bajo', comando: '\\_', ejemplo: '\\_'},
        {nombre: 'Guion bajo texto', comando: '\\text{\\textunderscore}', ejemplo: '\\text{\\textunderscore}'},
        {nombre: 'Raya corta', comando: '\\text{--}', ejemplo: '\\text{--}'},
        {nombre: 'Semiraya', comando: '\\text{\\textendash}', ejemplo: '\\text{\\textendash}'},
        {nombre: 'Raya larga', comando: '\\text{---}', ejemplo: '\\text{---}'},
        {nombre: 'Raya', comando: '\\text{\\textemdash}', ejemplo: '\\text{\\textemdash}'},
        {nombre: 'Virgulilla', comando: '\\text{\\textasciitilde}', ejemplo: '\\text{\\textasciitilde}'},
        {nombre: 'Acento circunflejo texto', comando: '\\text{\\textasciicircum}', ejemplo: '\\text{\\textasciicircum}'},
        {nombre: 'Comilla simple izquierda', comando: '`', ejemplo: '`'},
        {nombre: 'Comilla simple izquierda texto', comando: '\\text{\\textquoteleft}', ejemplo: '\\text{\\textquoteleft}'},
        {nombre: 'Comilla simple izquierda', comando: '\\lq', ejemplo: '\\lq'},
        {nombre: 'Comilla simple derecha', comando: '\\text{\\textquoteright}', ejemplo: '\\text{\\textquoteright}'},
        {nombre: 'Comilla simple derecha', comando: '\\rq', ejemplo: '\\rq'},
        {nombre: 'Comilla doble izquierda', comando: '\\text{\\textquotedblleft}', ejemplo: '\\text{\\textquotedblleft}'},
        {nombre: 'Comilla doble', comando: '"', ejemplo: '"'},
        {nombre: 'Comilla doble derecha', comando: '\\text{\\textquotedblright}', ejemplo: '\\text{\\textquotedblright}'},
        {nombre: 'Dos puntos matemáticos', comando: '\\colon', ejemplo: '\\colon'},
        {nombre: 'Prima invertida', comando: '\\backprime', ejemplo: '\\backprime'},
        {nombre: 'Prima', comando: '\\prime', ejemplo: '\\prime'},
        {nombre: 'Signo menor que texto', comando: '\\text{\\textless}', ejemplo: '\\text{\\textless}'},
        {nombre: 'Signo mayor que texto', comando: '\\text{\\textgreater}', ejemplo: '\\text{\\textgreater}'},
        {nombre: 'Barra vertical texto', comando: '\\text{\\textbar}', ejemplo: '\\text{\\textbar}'},
        {nombre: 'Barra vertical doble texto', comando: '\\text{\\textbardbl}', ejemplo: '\\text{\\textbardbl}'},
        {nombre: 'Llave izquierda texto', comando: '\\text{\\textbraceleft}', ejemplo: '\\text{\\textbraceleft}'},
        {nombre: 'Llave derecha texto', comando: '\\text{\\textbraceright}', ejemplo: '\\text{\\textbraceright}'},
        {nombre: 'Barra invertida texto', comando: '\\text{\\textbackslash}', ejemplo: '\\text{\\textbackslash}'},
        {nombre: 'Signo de párrafo', comando: '\\text{\\P}', ejemplo: '\\text{\\P}'},
        {nombre: 'Signo de párrafo', comando: '\\P', ejemplo: '\\P'},
        {nombre: 'Signo de sección', comando: '\\text{\\S}', ejemplo: '\\text{\\S}'},
        {nombre: 'Signo de sección', comando: '\\S', ejemplo: '\\S'},
        {nombre: 'Signo de sección alternativo', comando: '\\text{\\sect}', ejemplo: '\\text{\\sect}'},
        {nombre: 'Derechos de autor', comando: '\\copyright', ejemplo: '\\copyright'},
        {nombre: 'Marca registrada círculo', comando: '\\circledR', ejemplo: '\\circledR'},
        {nombre: 'Marca registrada', comando: '\\text{\\textregistered}', ejemplo: '\\text{\\textregistered}'},
        {nombre: 'S en círculo', comando: '\\circledS', ejemplo: '\\circledS'},
        {nombre: 'Letra en círculo', comando: '\\text{\\textcircled a}', ejemplo: '\\text{\\textcircled a}'},
        {nombre: 'Puntos suspensivos', comando: '\\dots', ejemplo: '\\dots'},
        {nombre: 'Puntos centrados', comando: '\\cdots', ejemplo: '\\cdots'},
        {nombre: 'Puntos diagonales', comando: '\\ddots', ejemplo: '\\ddots'},
        {nombre: 'Puntos suspensivos bajos', comando: '\\ldots', ejemplo: '\\ldots'},
        {nombre: 'Puntos verticales', comando: '\\vdots', ejemplo: '\\vdots'},
        {nombre: 'Puntos con operadores binarios', comando: '\\dotsb', ejemplo: '\\dotsb'},
        {nombre: 'Puntos con comas', comando: '\\dotsc', ejemplo: '\\dotsc'},
        {nombre: 'Puntos con integrales', comando: '\\dotsi', ejemplo: '\\dotsi'},
        {nombre: 'Puntos con multiplicación', comando: '\\dotsm', ejemplo: '\\dotsm'},
        {nombre: 'Puntos otros', comando: '\\dotso', ejemplo: '\\dotso'},
        {nombre: 'Punto pequeño', comando: '\\sdot', ejemplo: '\\sdot'},
        {nombre: 'Puntos suspensivos matemáticos', comando: '\\mathellipsis', ejemplo: '\\mathellipsis'},
        {nombre: 'Puntos suspensivos de texto', comando: '\\text{\\textellipsis}', ejemplo: '\\text{\\textellipsis}'},
        {nombre: 'Cuadrado', comando: '\\Box', ejemplo: '\\Box'},
        {nombre: 'Cuadrado', comando: '\\square', ejemplo: '\\square'},
        {nombre: 'Cuadrado negro', comando: '\\blacksquare', ejemplo: '\\blacksquare'},
        {nombre: 'Triángulo', comando: '\\triangle', ejemplo: '\\triangle'},
        {nombre: 'Triángulo izquierdo', comando: '\\triangleleft', ejemplo: '\\triangleleft'},
        {nombre: 'Triángulo derecho', comando: '\\triangleright', ejemplo: '\\triangleright'},
        {nombre: 'Triángulo invertido grande', comando: '\\bigtriangledown', ejemplo: '\\bigtriangledown'},
        {nombre: 'Triángulo grande', comando: '\\bigtriangleup', ejemplo: '\\bigtriangleup'},
        {nombre: 'Triángulo negro', comando: '\\blacktriangle', ejemplo: '\\blacktriangle'},
        {nombre: 'Triángulo invertido negro', comando: '\\blacktriangledown', ejemplo: '\\blacktriangledown'},
        {nombre: 'Triángulo izquierdo negro', comando: '\\blacktriangleleft', ejemplo: '\\blacktriangleleft'},
        {nombre: 'Triángulo derecho negro', comando: '\\blacktriangleright', ejemplo: '\\blacktriangleright'},
        {nombre: 'Diamante', comando: '\\diamond', ejemplo: '\\diamond'},
        {nombre: 'Diamante', comando: '\\Diamond', ejemplo: '\\Diamond'},
        {nombre: 'Rombo', comando: '\\lozenge', ejemplo: '\\lozenge'},
        {nombre: 'Rombo negro', comando: '\\blacklozenge', ejemplo: '\\blacklozenge'},
        {nombre: 'Estrella', comando: '\\star', ejemplo: '\\star'},
        {nombre: 'Estrella grande', comando: '\\bigstar', ejemplo: '\\bigstar'},
        {nombre: 'Tréboles', comando: '\\clubsuit', ejemplo: '\\clubsuit'},
        {nombre: 'Tréboles', comando: '\\clubs', ejemplo: '\\clubs'},
        {nombre: 'Diamantes', comando: '\\diamondsuit', ejemplo: '\\diamondsuit'},
        {nombre: 'Diamantes', comando: '\\diamonds', ejemplo: '\\diamonds'},
        {nombre: 'Picas', comando: '\\spadesuit', ejemplo: '\\spadesuit'},
        {nombre: 'Cruz de Malta', comando: '\\maltese', ejemplo: '\\maltese'},
        {nombre: 'KaTeX', comando: '\\KaTeX', ejemplo: '\\KaTeX'},
        {nombre: 'LaTeX', comando: '\\LaTeX', ejemplo: '\\LaTeX'},
        {nombre: 'TeX', comando: '\\TeX', ejemplo: '\\TeX'},
        {nombre: 'Nabla', comando: '\\nabla', ejemplo: '\\nabla'},
        {nombre: 'Infinito', comando: '\\infty', ejemplo: '\\infty'},
        {nombre: 'Infinito alternativo', comando: '\\infin', ejemplo: '\\infin'},
        {nombre: 'Marca de verificación', comando: '\\checkmark', ejemplo: '\\checkmark'},
        {nombre: 'Daga', comando: '\\dag', ejemplo: '\\dag'},
        {nombre: 'Daga', comando: '\\dagger', ejemplo: '\\dagger'},
        {nombre: 'Daga texto', comando: '\\text{\\textdagger}', ejemplo: '\\text{\\textdagger}'},
        {nombre: 'Daga doble', comando: '\\ddag', ejemplo: '\\ddag'},
        {nombre: 'Daga doble', comando: '\\ddagger', ejemplo: '\\ddagger'},
        {nombre: 'Daga doble texto', comando: '\\text{\\textdaggerdbl}', ejemplo: '\\text{\\textdaggerdbl}'},
        {nombre: 'Daga doble', comando: '\\Dagger', ejemplo: '\\Dagger'},
        {nombre: 'Ángulo', comando: '\\angle', ejemplo: '\\angle'},
        {nombre: 'Ángulo medido', comando: '\\measuredangle', ejemplo: '\\measuredangle'},
        {nombre: 'Ángulo esférico', comando: '\\sphericalangle', ejemplo: '\\sphericalangle'},
        {nombre: 'Top', comando: '\\top', ejemplo: '\\top'},
        {nombre: 'Bottom', comando: '\\bot', ejemplo: '\\bot'},
        {nombre: 'Signo de dólar', comando: '\\$', ejemplo: '\\$'},
        {nombre: 'Signo de dólar texto', comando: '\\text{\\textdollar}', ejemplo: '\\text{\\textdollar}'},
        {nombre: 'Signo de libra', comando: '\\pounds', ejemplo: '\\pounds'},
        {nombre: 'Signo de libra esterlina', comando: '\\mathsterling', ejemplo: '\\mathsterling'},
        {nombre: 'Signo de libra esterlina texto', comando: '\\text{\\textsterling}', ejemplo: '\\text{\\textsterling}'},
        {nombre: 'Signo de yen', comando: '\\yen', ejemplo: '\\yen'},
        {nombre: 'Símbolo de raíz cuadrada', comando: '\\surd', ejemplo: '\\surd'},
        {nombre: 'Grado', comando: '\\degree', ejemplo: '\\degree'},
        {nombre: 'Grado texto', comando: '\\text{\\textdegree}', ejemplo: '\\text{\\textdegree}'},
        {nombre: 'Mho', comando: '\\mho', ejemplo: '\\mho'},
        {nombre: 'Diagonal descendente', comando: '\\diagdown', ejemplo: '\\diagdown'},
        {nombre: 'Diagonal ascendente', comando: '\\diagup', ejemplo: '\\diagup'},
        {nombre: 'Bemol', comando: '\\flat', ejemplo: '\\flat'},
        {nombre: 'Becuadro', comando: '\\natural', ejemplo: '\\natural'},
        {nombre: 'Sostenido', comando: '\\sharp', ejemplo: '\\sharp'},
        {nombre: 'Corazones', comando: '\\heartsuit', ejemplo: '\\heartsuit'},
        {nombre: 'Corazones', comando: '\\hearts', ejemplo: '\\hearts'},
        {nombre: 'Picas', comando: '\\spades', ejemplo: '\\spades'},
        {nombre: 'Círculo con menos', comando: '\\minuso', ejemplo: '\\minuso' }],
}

const btnMatematicas = document.getElementById('btn-matematicas');
const panelMatematicas = document.getElementById('panel-matematicas');

btnMatematicas.addEventListener('click', (e) => {
    e.stopPropagation();
    const panelMermaid = document.getElementById('panel-mermaid');
    
    if (panelMermaid.classList.contains('visible')) {
        panelMermaid.classList.remove('visible');
    }
    
    panelMatematicas.classList.toggle('visible');
    
    if (panelMatematicas.classList.contains('visible')) {
        renderizarSimbolosKatex();
    }
});

document.addEventListener('click', (e) => {
    if (panelMatematicas.classList.contains('visible') && 
        !panelMatematicas.contains(e.target) && 
        e.target !== btnMatematicas) {
        panelMatematicas.classList.remove('visible');
    }
});

document.querySelectorAll('.categoria').forEach(boton => {
    boton.addEventListener('click', () => {
        document.querySelectorAll('.categoria').forEach(c => c.classList.remove('activa'));
        boton.classList.add('activa');
        const categoria = boton.dataset.categoria;
        document.querySelectorAll('.funciones-grid').forEach(grid => {
            grid.style.display = 'none';
        });
        document.getElementById(`funciones-${categoria}`).style.display = 'grid';
        renderizarSimbolosKatex();
    });
});

function poblarFuncionesMatematicas() {
    Object.keys(funcionesMatematicas).forEach(categoria => {
        const contenedor = document.getElementById(`funciones-${categoria}`);
        if (!contenedor) return;
        
        contenedor.innerHTML = '';
        
        funcionesMatematicas[categoria].forEach(funcion => {
            const boton = document.createElement('button');
            boton.className = 'funcion';
            boton.dataset.comando = funcion.comando;
            boton.title = funcion.nombre;
            const simbolo = document.createElement('div');
            simbolo.className = 'simbolo-katex';
            simbolo.dataset.ejemplo = funcion.ejemplo;
            boton.appendChild(simbolo);
            const nombre = document.createElement('div');
            nombre.className = 'nombre-funcion';
            nombre.textContent = funcion.nombre;
            boton.appendChild(nombre);
            boton.addEventListener('click', () => {
                insertarTexto(funcion.comando);
                panelMatematicas.classList.remove('visible');
            });
            
            contenedor.appendChild(boton);
        });
    });
}

function renderizarSimbolosKatex() {
    document.querySelectorAll('.simbolo-katex').forEach(elemento => {
        const ejemplo = elemento.dataset.ejemplo;
        try {
            elemento.innerHTML = '';
            
            katex.render(ejemplo, elemento, {
                throwOnError: false,
                displayMode: false,
                output: 'html',
                fleqn: false,
                leqno: false,
                trust: false,
                maxSize: 100,
                maxExpand: 50,
                strict: false
            });
            
            setTimeout(() => {
                const katexElements = elemento.querySelectorAll('.katex, .katex-display, .katex-html');
                katexElements.forEach(el => {
                    el.style.display = 'flex';
                    el.style.justifyContent = 'center';
                    el.style.alignItems = 'center';
                    el.style.width = '100%';
                });
            }, 10);
            
        } catch (e) {
            console.error('Error al renderizar KaTeX:', e);
            elemento.textContent = ejemplo;
            elemento.style.fontSize = '1.4em';
            elemento.style.display = 'flex';
            elemento.style.alignItems = 'center';
            elemento.style.justifyContent = 'center';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    poblarFuncionesMatematicas();
    document.querySelector('.categoria.activa')?.click();
});

const diagramasMermaid = {
    flowchart: [
    {
        nombre: "Algoritmo de Euclides (MCD)",
        ejemplo: `graph TD
    A[Inicio] --> B[a, b números]
    B --> C{b == 0?}
    C -->|Sí| D[MCD = a]
    C -->|No| E[b, a % b]
    E --> B
    D --> F[Fin]`
    },
    {
        nombre: "Conjetura de Collatz",
        ejemplo: `graph TD
    A[Inicio] --> B[n número]
    B --> C{n es par?}
    C -->|Sí| D[n = n / 2]
    C -->|No| E[n = 3*n + 1]
    D --> F{n == 1?}
    E --> F
    F -->|Sí| G[Fin]
    F -->|No| C`
    },
    {
        nombre: "Cálculo de Factorial",
        ejemplo: `graph TD
    A[Inicio] --> B[n, i=1, fact=1]
    B --> C{i <= n?}
    C -->|Sí| D[fact = fact * i]
    D --> E[i = i + 1]
    E --> C
    C -->|No| F[Resultado = fact]
    F --> G[Fin]`
    },
    {
        nombre: "Sucesión de Fibonacci",
        ejemplo: `graph TD
    A[Inicio] --> B[n términos, a=0, b=1, count=0]
    B --> C{count < n?}
    C -->|Sí| D[Imprimir a]
    D --> E[a, b = b, a+b]
    E --> F[count = count+1]
    F --> C
    C -->|No| G[Fin]`
    },
    {
        nombre: "Máximo Común Divisor",
        ejemplo: `graph TD
    A[Inicio] --> B[x, y números]
    B --> C{y == 0?}
    C -->|Sí| D[MCD = x]
    C -->|No| E[x, y = y, x mod y]
    E --> C
    D --> F[Fin]`
    }],
    sequence: [
    {
        nombre: "Resolución de Ecuación Cuadrática",
        ejemplo: `sequenceDiagram
    Usuario->>Sistema: Resolver ax² + bx + c = 0
    Sistema->>Sistema: Calcular discriminante Δ = b² - 4ac
    alt Δ > 0
        Sistema->>Sistema: x₁ = (-b + √Δ)/2a
        Sistema->>Sistema: x₂ = (-b - √Δ)/2a
        Sistema-->>Usuario: Dos soluciones reales
    else Δ == 0
        Sistema->>Sistema: x = -b/2a
        Sistema-->>Usuario: Una solución real
    else Δ < 0
        Sistema->>Sistema: Parte real = -b/2a
        Sistema->>Sistema: Parte imaginaria = √(-Δ)/2a
        Sistema-->>Usuario: Soluciones complejas
    end`
    },
    {
        nombre: "Cálculo de Integral Definida",
        ejemplo: `sequenceDiagram
    Usuario->>Sistema: Calcular ∫f(x)dx de a a b
    Sistema->>Sistema: Dividir intervalo [a,b] en n partes
    loop Para cada subintervalo
        Sistema->>Sistema: Calcular área del trapecio
        Sistema->>Sistema: Sumar al total
    end
    Sistema-->>Usuario: Resultado de la integral`
    },
    {
        nombre: "Método de Newton-Raphson",
        ejemplo: `sequenceDiagram
    Usuario->>Sistema: Resolver f(x)=0 con x₀
    loop Hasta convergencia
        Sistema->>Sistema: Calcular f(xₙ) y f'(xₙ)
        Sistema->>Sistema: xₙ₊₁ = xₙ - f(xₙ)/f'(xₙ)
        Sistema->>Sistema: Verificar |xₙ₊₁ - xₙ| < ε
    end
    Sistema-->>Usuario: Solución aproximada xₙ`
    },
    {
        nombre: "Multiplicación de Matrices",
        ejemplo: `sequenceDiagram
    Usuario->>Sistema: Multiplicar matrices A y B
    loop Para cada fila i de A
        loop Para cada columna j de B
            Sistema->>Sistema: C[i,j] = 0
            loop Para cada k
                Sistema->>Sistema: C[i,j] += A[i,k] × B[k,j]
            end
        end
    end
    Sistema-->>Usuario: Matriz resultante C`
    },
    {
        nombre: "Transformada de Fourier",
        ejemplo: `sequenceDiagram
    Usuario->>Sistema: Calcular FFT de señal
    Sistema->>Sistema: Aplicar algoritmo mariposa
    loop Para cada etapa
        loop Para cada mariposa
            Sistema->>Sistema: Calcular suma y diferencia
            Sistema->>Sistema: Aplicar factores twiddle
        end
    end
    Sistema-->>Usuario: Coeficientes de Fourier`
    },
    {
        nombre: "Cálculo de Determinante",
        ejemplo: `sequenceDiagram
    Usuario->>Sistema: Calcular det(A)
    alt Matriz 2x2
        Sistema->>Sistema: det = a₁₁·a₂₂ - a₁₂·a₂₁
    else Matriz 3x3
        Sistema->>Sistema: Regla de Sarrus
    else Matriz n×n
        Sistema->>Sistema: Expansión por cofactores
        loop Para cada columna j
            Sistema->>Sistema: Calcular menor M₁ⱼ
            Sistema->>Sistema: Calcular cofactor C₁ⱼ
            Sistema->>Sistema: Sumar a₁ⱼ·C₁ⱼ
        end
    end
    Sistema-->>Usuario: Valor del determinante`
    },
    {
        nombre: "Resolución Sistema Ecuaciones",
        ejemplo: `sequenceDiagram
    Usuario->>Sistema: Resolver AX = B
    Sistema->>Sistema: Formar matriz aumentada [A|B]
    Sistema->>Sistema: Aplicar eliminación Gaussiana
    loop Para cada pivote
        Sistema->>Sistema: Hacer 1 en diagonal
        Sistema->>Sistema: Hacer 0 en columna
    end
    Sistema->>Sistema: Sustitución hacia atrás
    Sistema-->>Usuario: Vector solución X`
    },
    {
        nombre: "Cálculo de Autovalores",
        ejemplo: `sequenceDiagram
    Usuario->>Sistema: Calcular autovalores de A
    alt Matriz 2x2
        Sistema->>Sistema: Resolver ecuación característica
    else Matriz general
        Sistema->>Sistema: Aplicar algoritmo QR
        loop Iteraciones hasta convergencia
            Sistema->>Sistema: Factorización A = QR
            Sistema->>Sistema: A = RQ
        end
    end
    Sistema-->>Usuario: Autovalores en diagonal`
    },
    {
        nombre: "Interpolación Polinómica",
        ejemplo: `sequenceDiagram
    Usuario->>Sistema: Interpolar puntos (xᵢ,yᵢ)
    Sistema->>Sistema: Construir matriz de Vandermonde
    Sistema->>Sistema: Resolver sistema lineal
    Sistema->>Sistema: Obtener coeficientes polinomio
    Sistema-->>Usuario: Polinomio interpolador`
    },
    {
        nombre: "Método de Montecarlo",
        ejemplo: `sequenceDiagram
    Usuario->>Sistema: Integrar por Montecarlo
    Sistema->>Sistema: Generar n puntos aleatorios
    loop Para cada punto
        Sistema->>Sistema: Evaluar f(x)
        Sistema->>Sistema: Sumar a total
    end
    Sistema->>Sistema: Promedio = total/n
    Sistema->>Sistema: Área = promedio × volumen
    Sistema-->>Usuario: Estimación de integral`
    }],
    class: [
    {
        nombre: "Estructuras Algebraicas Básicas",
        ejemplo: `classDiagram
    class Conjunto {
        +elementos
        +pertenece()
        +subconjunto()
    }
    
    class Grupo {
        +operación
        +elemento_neutro
        +elemento_inverso()
        +asociatividad()
    }
    
    class Anillo {
        +suma
        +multiplicación
        +distributividad()
    }
    
    class Cuerpo {
        +elemento_inverso_multiplicativo()
        +conmutatividad_multiplicación()
    }
    
    Conjunto <|-- Grupo
    Grupo <|-- Anillo
    Anillo <|-- Cuerpo`
    },
    {
        nombre: "Espacios Vectoriales",
        ejemplo: `classDiagram
    class EspacioVectorial {
        +V: conjunto vectores
        +K: cuerpo escalares
        +suma_vectores()
        +producto_escalar()
    }
    
    class Base {
        +vectores_linealmente_independientes
        +generan_todo_el_espacio()
    }
    
    class TransformaciónLineal {
        +preserva_suma()
        +preserva_producto_escalar()
    }
    
    EspacioVectorial "1" -- "*" Base : tiene
    EspacioVectorial "1" -- "*" TransformaciónLineal : define`
    },
    {
        nombre: "Números y sus Extensiones",
        ejemplo: `classDiagram
    class ℕ {
        +números_naturales
        +operación_suma()
        +operación_multiplicación()
    }
    
    class ℤ {
        +números_enteros
        +operación_resta()
        +elemento_opuesto()
    }
    
    class ℚ {
        +números_racionales
        +operación_división()
        +elemento_inverso()
    }
    
    class ℝ {
        +números_reales
        +completitud()
        +propiedad_arquimediana()
    }
    
    class ℂ {
        +números_complejos
        +parte_real
        +parte_imaginaria
        +conjugado()
        +módulo()
    }
    
    ℕ <|-- ℤ
    ℤ <|-- ℚ
    ℚ <|-- ℝ
    ℝ <|-- ℂ`
    },
    {
        nombre: "Funciones Matemáticas",
        ejemplo: `classDiagram
    class Función {
        +dominio
        +codominio
        +evaluar()
    }
    
    class FunciónLineal {
        +pendiente
        +ordenada_al_origen
        +es_inyectiva()
    }
    
    class FunciónCuadrática {
        +coeficiente_cuadrático
        +coeficiente_lineal
        +término_independiente
        +vértice()
        +discriminante()
    }
    
    class FunciónTrigonométrica {
        +período
        +amplitud
        +fase()
    }
    
    class FunciónExponencial {
        +base
        +crecimiento_exponencial()
    }
    
    Función <|-- FunciónLineal
    Función <|-- FunciónCuadrática
    Función <|-- FunciónTrigonométrica
    Función <|-- FunciónExponencial`
    },
    {
        nombre: "Geometría Euclidiana",
        ejemplo: `classDiagram
    class Punto {
        +coordenada_x
        +coordenada_y
        +distancia()
    }
    
    class Vector {
        +componente_x
        +componente_y
        +módulo()
        +dirección()
    }
    
    class Recta {
        +punto
        +vector_director
        +ecuación_paramétrica()
        +ecuación_implícita()
    }
    
    class Plano {
        +punto
        +vector_normal
        +ecuación_general()
    }
    
    Punto "1" -- "*" Recta : pertenece
    Vector "1" -- "*" Recta : define
    Vector "1" -- "*" Plano : define`
    },
    {
        nombre: "Topología de Espacios Métricos",
        ejemplo: `classDiagram
    class EspacioMétrico {
        +conjunto
        +métrica
        +bola_abierta()
        +distancia()
    }
    
    class Abierto {
        +contiene_bolas_abiertas()
    }
    
    class Cerrado {
        +complemento_abierto()
    }
    
    class Compacto {
        +cubierta_abierta()
        +subcubierta_finita()
    }
    
    class Conexo {
        +no_separable()
    }
    
    EspacioMétrico "1" -- "*" Abierto : tiene
    EspacioMétrico "1" -- "*" Cerrado : tiene
    EspacioMétrico "1" -- "*" Compacto : tiene
    EspacioMétrico "1" -- "*" Conexo : tiene`
    },
    {
        nombre: "Teoría de Grafos",
        ejemplo: `classDiagram
    class Grafo {
        +vértices
        +aristas
        +adyacencia()
    }
    
    class GrafoSimple {
        +sin_bucles()
        +sin_múltiples_aristas()
    }
    
    class GrafoDirigido {
        +aristas_dirigidas
        +grado_entrada()
        +grado_salida()
    }
    
    class GrafoPonderado {
        +pesos
        +camino_mínimo()
    }
    
    class Árbol {
        +acíclico()
        +conexo()
    }
    
    Grafo <|-- GrafoSimple
    Grafo <|-- GrafoDirigido
    Grafo <|-- GrafoPonderado
    Grafo <|-- Árbol`
    },
    {
        nombre: "Anillos de Polinomios",
        ejemplo: `classDiagram
    class Polinomio {
        +coeficientes
        +grado
        +evaluar()
        +derivar()
    }
    
    class PolinomioMónico {
        +coeficiente_principal_1()
    }
    
    class PolinomioIrreducible {
        +no_factorizable()
    }
    
    class Raíz {
        +valor
        +multiplicidad
    }
    
    Polinomio "1" -- "*" Raíz : tiene
    Polinomio <|-- PolinomioMónico
    Polinomio <|-- PolinomioIrreducible`
    },
    {
        nombre: "Espacios de Hilbert",
        ejemplo: `classDiagram
    class EspacioPrehilbert {
        +producto_interno()
        +norma()
    }
    
    class EspacioHilbert {
        +completo
        +base_ortonormal()
    }
    
    class OperadorLineal {
        +acotado
        +adjunto()
    }
    
    class OperadorAutoadjunto {
        +igual_a_su_adjunto()
    }
    
    class OperadorUnitario {
        +preserva_producto_interno()
    }
    
    EspacioPrehilbert <|-- EspacioHilbert
    EspacioHilbert "1" -- "*" OperadorLineal : define
    OperadorLineal <|-- OperadorAutoadjunto
    OperadorLineal <|-- OperadorUnitario`
    },
    {
        nombre: "Variedades Diferenciales",
        ejemplo: `classDiagram
    class Variedad {
        +dimensión
        +cartas
        +atlas()
    }
    
    class EspacioTangente {
        +vectores_tangentes
        +base()
    }
    
    class CampoVectorial {
        +asignación_punto_a_vector()
        +derivada_lie()
    }
    
    class FormaDiferencial {
        +grado
        +derivada_exterior()
    }
    
    Variedad "1" -- "*" EspacioTangente : tiene
    Variedad "1" -- "*" CampoVectorial : define
    Variedad "1" -- "*" FormaDiferencial : define`
    }],
    state: [
    {
        nombre: "Máquina de Turing para Suma Binaria",
        ejemplo: `stateDiagram-v2
    [*] --> Inicio
    Inicio --> LeyendoBit1 : Leer bit 1
    LeyendoBit1 --> LeyendoBit2 : Leer bit 2
    LeyendoBit2 --> CalculandoSuma : Calcular suma
    CalculandoSuma --> VerificandoAcarreo : Verificar acarreo
    VerificandoAcarreo --> EscribiendoResultado : Escribir resultado
    EscribiendoResultado --> MoviendoCabezal : Mover cabezal
    MoviendoCabezal --> LeyendoBit1 : Siguientes bits
    MoviendoCabezal --> [*] : Fin de cadena`
    },
    {
        nombre: "Algoritmo de Euclides para MCD",
        ejemplo: `stateDiagram-v2
    [*] --> Inicialización
    Inicialización --> Comparación : a, b
    Comparación --> Resta : b ≠ 0
    Resta --> Asignación : a = b, b = a mod b
    Asignación --> Comparación
    Comparación --> Resultado : b = 0
    Resultado --> [*] : MCD = a`
    },
    {
        nombre: "Método de Newton-Raphson",
        ejemplo: `stateDiagram-v2
    [*] --> Inicio
    Inicio --> Evaluación : x₀, f(x), f'(x)
    Evaluación --> CálculoNuevoX : Calcular xₙ₊₁
    CálculoNuevoX --> VerificaciónConvergencia : |xₙ₊₁ - xₙ| < ε
    VerificaciónConvergencia --> Evaluación : No convergido
    VerificaciónConvergencia --> Solución : Convergido
    Solución --> [*] : Raíz encontrada`
    },
    {
        nombre: "Autómata para Números Primos",
        ejemplo: `stateDiagram-v2
    [*] --> Inicio
    Inicio --> EsCero : n = 0
    Inicio --> EsUno : n = 1
    Inicio --> MayorQueUno : n > 1
    
    EsCero --> [*] : No primo
    EsUno --> [*] : No primo
    
    MayorQueUno --> VerificaciónDivisor : i = 2
    VerificaciónDivisor --> DivisorEncontrado : n mod i = 0
    VerificaciónDivisor --> IncrementoDivisor : n mod i ≠ 0, i < √n
    IncrementoDivisor --> VerificaciónDivisor : i = i + 1
    VerificaciónDivisor --> EsPrimo : i > √n
    DivisorEncontrado --> [*] : No primo
    EsPrimo --> [*] : Primo`
    },
    {
        nombre: "Proceso de Integración Numérica",
        ejemplo: `stateDiagram-v2
    [*] --> Configuración
    Configuración --> DivisiónIntervalo : a, b, n
    DivisiónIntervalo --> Inicialización : Δx = (b-a)/n
    Inicialización --> CálculoPunto : i = 0, suma = 0
    CálculoPunto --> EvaluaciónFunción : xᵢ = a + i·Δx
    EvaluaciónFunción --> SumaÁrea : f(xᵢ)
    SumaÁrea --> VerificaciónFinal : suma += f(xᵢ)·Δx
    VerificaciónFinal --> Incremento : i < n
    Incremento --> CálculoPunto : i = i + 1
    VerificaciónFinal --> Resultado : i = n
    Resultado --> [*] : ∫f(x)dx ≈ suma`
    },
    {
        nombre: "Transformada Rápida de Fourier (FFT)",
        ejemplo: `stateDiagram-v2
    [*] --> VerificaciónTamaño
    VerificaciónTamaño --> División : N > 1
    División --> FFTPar : Calcular FFT pares
    División --> FFTImpar : Calcular FFT impares
    FFTPar --> Combinación
    FFTImpar --> Combinación
    Combinación --> ResultadoParcial : Combinar resultados
    ResultadoParcial --> VerificaciónTamaño : Siguiente nivel
    VerificaciónTamaño --> [*] : N = 1, resultado final`
    },
    {
        nombre: "Algoritmo de Dijkstra",
        ejemplo: `stateDiagram-v2
    [*] --> Inicialización
    Inicialización --> SelecciónVértice : dist[origen] = 0
    SelecciónVértice --> Relajación : Seleccionar vértice no visitado con menor distancia
    Relajación --> ActualizaciónDistancias : Para cada vecino, actualizar distancias
    ActualizaciónDistancias --> MarcarVisitado : Marcar vértice como visitado
    MarcarVisitado --> VerificaciónFinal : ¿Todos visitados?
    VerificaciónFinal --> SelecciónVértice : No
    VerificaciónFinal --> [*] : Sí, caminos mínimos encontrados`
    },
    {
        nombre: "Método de Bisección",
        ejemplo: `stateDiagram-v2
    [*] --> VerificaciónIntervalo
    VerificaciónIntervalo --> CálculoPuntoMedio : f(a)·f(b) < 0
    CálculoPuntoMedio --> EvaluaciónPuntoMedio : c = (a+b)/2
    EvaluaciónPuntoMedio --> ActualizaciónIntervalo : f(c)
    ActualizaciónIntervalo --> VerificaciónPrecisión : Si f(a)·f(c) < 0 entonces b = c, sino a = c
    VerificaciónPrecisión --> CálculoPuntoMedio : |b-a| > ε
    VerificaciónPrecisión --> [*] : |b-a| ≤ ε, raíz ≈ c`
    },
    {
        nombre: "Generación de Números Aleatorios",
        ejemplo: `stateDiagram-v2
    [*] --> Semilla
    Semilla --> Generación : x₀
    Generación --> Transformación : xₙ₊₁ = (a·xₙ + c) mod m
    Transformación --> Normalización : rₙ = xₙ/m
    Normalización --> [*] : Número aleatorio rₙ
    Normalización --> Generación : Próximo número`
    },
    {
        nombre: "Resolución de Sistemas Lineales",
        ejemplo: `stateDiagram-v2
    [*] --> FormulaciónMatricial
    FormulaciónMatricial --> Triangularización : [A|b]
    Triangularización --> SustituciónAdelante : Matriz triangular superior
    SustituciónAdelante --> SustituciónAtrás : Resolver para variables
    SustituciónAtrás --> VerificaciónSolución : Obtener solución
    VerificaciónSolución --> [*] : Solución válida
    VerificaciónSolución --> Reformulación : Error grande, reformular problema`
    }],
    erd: [
    {
        nombre: "Estructura de Espacios Vectoriales",
        ejemplo: `erDiagram
    ESPACIO-VECTORIAL ||--o{ VECTOR : contiene
    ESPACIO-VECTORIAL ||--|| CUERPO : sobre
    VECTOR ||--o{ OPERACION : participa
    OPERACION ||--|| TIPO-OPERACION : es_de
    
    ESPACIO-VECTORIAL {
        string nombre
        int dimension
    }
    VECTOR {
        float componente_x
        float componente_y
        float componente_z
    }
    CUERPO {
        string simbolo
        string descripcion
    }
    OPERACION {
        string tipo
        float resultado
    }
    TIPO-OPERACION {
        string nombre
        string propiedades
    }`
    },
    {
        nombre: "Sistema de Teoremas y Demostraciones",
        ejemplo: `erDiagram
    TEOREMA ||--o{ DEMOSTRACION : tiene
    TEOREMA ||--|{ AXIOMA : utiliza
    TEOREMA ||--o{ COROLARIO : genera
    DEMOSTRACION ||--|| METODO : emplea
    TEOREMA ||--o{ CONCEPTO : involucra
    
    TEOREMA {
        string enunciado
        string area_matematica
        int importancia
    }
    DEMOSTRACION {
        string pasos
        boolean formalizada
        int complejidad
    }
    AXIOMA {
        string principio
        string sistema
    }
    COROLARIO {
        string consecuencia
        string relacion
    }
    METODO {
        string nombre
        string descripcion
    }
    CONCEPTO {
        string termino
        string definicion
    }`
    },
    {
        nombre: "Estructura Algebraica de Grupos",
        ejemplo: `erDiagram
    GRUPO ||--o{ ELEMENTO : contiene
    GRUPO ||--|| OPERACION-BINARIA : tiene
    ELEMENTO ||--|| ELEMENTO-NEUTRO : es_o_tiene
    ELEMENTO ||--|| ELEMENTO-INVERSO : tiene
    GRUPO ||--o{ PROPIEDAD : satisface
    
    GRUPO {
        string notacion
        int orden
        boolean abeliano
    }
    ELEMENTO {
        string simbolo
        string propiedades
    }
    OPERACION-BINARIA {
        string simbolo
        string definicion
    }
    ELEMENTO-NEUTRO {
        string simbolo
        string propiedades
    }
    ELEMENTO-INVERSO {
        string relacion
        string calculo
    }
    PROPIEDAD {
        string nombre
        string descripcion
    }`
    },
    {
        nombre: "Sistema de Funciones y Dominios",
        ejemplo: `erDiagram
    FUNCION ||--|| DOMINIO : definida_en
    FUNCION ||--|| CODOMINIO : mapea_a
    FUNCION ||--o{ VARIABLE : tiene
    FUNCION ||--|{ OPERACION : compuesta_con
    FUNCION ||--o{ PROPIEDAD-FUNCION : posee
    
    FUNCION {
        string expresion
        string tipo
        boolean biyectiva
    }
    DOMINIO {
        string conjunto
        string restricciones
    }
    CODOMINIO {
        string conjunto
        string descripcion
    }
    VARIABLE {
        string nombre
        string tipo
    }
    OPERACION {
        string simbolo
        string efecto
    }
    PROPIEDAD-FUNCION {
        string caracteristica
        string condicion
    }`
    },
    {
        nombre: "Estructura de Geometría Diferencial",
        ejemplo: `erDiagram
    VARIEDAD ||--o{ CARTA : cubierta_por
    VARIEDAD ||--|| DIMENSION : tiene
    PUNTO ||--o{ VECTOR-TANGENTE : tiene
    VARIEDAD ||--o{ PUNTO : contiene
    VECTOR-TANGENTE ||--|| ESPACIO-TANGENTE : pertenece_a
    
    VARIEDAD {
        string nombre
        string tipo
        boolean compacta
    }
    CARTA {
        string coordenadas
        string dominio
    }
    DIMENSION {
        int n
        string propiedades
    }
    PUNTO {
        string coordenadas
        string vecindad
    }
    VECTOR-TANGENTE {
        string componentes
        string direccion
    }
    ESPACIO-TANGENTE {
        string base
        int dimension
    }`
    },
    {
        nombre: "Sistema de Ecuaciones Diferenciales",
        ejemplo: `erDiagram
    ECUACION-DIFERENCIAL ||--|| ORDEN : tiene
    ECUACION-DIFERENCIAL ||--|| TIPO : es_de
    ECUACION-DIFERENCIAL ||--o{ SOLUCION : tiene
    SOLUCION ||--|| METODO-RESOLUCION : obtenida_por
    ECUACION-DIFERENCIAL ||--o{ CONDICION-INICIAL : requiere
    
    ECUACION-DIFERENCIAL {
        string expresion
        string variables
        boolean lineal
    }
    ORDEN {
        int n
        string implicaciones
    }
    TIPO {
        string nombre
        string caracteristicas
    }
    SOLUCION {
        string forma
        string dominio_validez
    }
    METODO-RESOLUCION {
        string nombre
        string aplicabilidad
    }
    CONDICION-INICIAL {
        string valores
        string posicion
    }`
    },
    {
        nombre: "Estructura de Teoría de Números",
        ejemplo: `erDiagram
    NUMERO ||--|| TIPO-NUMERO : es_de
    NUMERO ||--o{ PROPIEDAD-ARITMETICA : tiene
    NUMERO ||--o{ OPERACION-ARITMETICA : participa_en
    TEOREMA-NUMEROS ||--o{ NUMERO : involucra
    CONJUNTO-NUMERICO ||--o{ NUMERO : contiene
    
    NUMERO {
        string valor
        string representacion
        boolean primo
    }
    TIPO-NUMERO {
        string categoria
        string propiedades
    }
    PROPIEDAD-ARITMETICA {
        string nombre
        string condicion
    }
    OPERACION-ARITMETICA {
        string simbolo
        string resultado
    }
    TEOREMA-NUMEROS {
        string enunciado
        string demostracion
    }
    CONJUNTO-NUMERICO {
        string simbolo
        string definicion
    }`
    },
    {
        nombre: "Sistema de Topología General",
        ejemplo: `erDiagram
    ESPACIO-TOPOLOGICO ||--o{ ABIERTO : contiene
    ESPACIO-TOPOLOGICO ||--|| TOPOLOGIA : tiene
    ABIERTO ||--o{ OPERACION-TOPOLOGICA : participa_en
    ESPACIO-TOPOLOGICO ||--o{ PROPIEDAD-TOPOLOGICA : satisface
    TOPOLOGIA ||--o{ AXIOMA-TOPOLOGICO : cumple
    
    ESPACIO-TOPOLOGICO {
        string nombre
        string base
        boolean Hausdorff
    }
    ABIERTO {
        string definicion
        string complemento
    }
    TOPOLOGIA {
        string familia
        string cardinalidad
    }
    OPERACION-TOPOLOGICA {
        string tipo
        string resultado
    }
    PROPIEDAD-TOPOLOGICA {
        string nombre
        string definicion
    }
    AXIOMA-TOPOLOGICO {
        string principio
        string importancia
    }`
    },
    {
        nombre: "Estructura de Análisis Complejo",
        ejemplo: `erDiagram
    FUNCION-COMPLEJA ||--|| VARIABLE-COMPLEJA : depende_de
    FUNCION-COMPLEJA ||--o{ SINGULARIDAD : tiene
    FUNCION-COMPLEJA ||--o{ PROPIEDAD-ANALITICA : posee
    REGION ||--o{ PUNTO-SINGULAR : contiene
    TEOREMA-COMPLEJO ||--o{ FUNCION-COMPLEJA : aplica_a
    
    FUNCION-COMPLEJA {
        string expresion
        boolean holomorfa
        string derivada
    }
    VARIABLE-COMPLEJA {
        string parte_real
        string parte_imaginaria
        string modulo
    }
    SINGULARIDAD {
        string tipo
        string residuo
        string orden
    }
    PROPIEDAD-ANALITICA {
        string nombre
        string condicion
    }
    REGION {
        string descripcion
        string frontera
    }
    PUNTO-SINGULAR {
        string ubicacion
        string caracterizacion
    }
    TEOREMA-COMPLEJO {
        string nombre
        string aplicacion
    }`
    },
    {
        nombre: "Sistema de Probabilidad y Estadística",
        ejemplo: `erDiagram
    ESPACIO-MUESTRAL ||--o{ EVENTO : contiene
    VARIABLE-ALEATORIA ||--|| DISTRIBUCION : sigue
    DISTRIBUCION ||--o{ PARAMETRO : tiene
    ESTADISTICO ||--|| METODO-CALCULO : calculado_con
    MODELO-ESTADISTICO ||--o{ HIPOTESIS : incluye
    
    ESPACIO-MUESTRAL {
        string elementos
        int cardinalidad
    }
    EVENTO {
        string descripcion
        float probabilidad
    }
    VARIABLE-ALEATORIA {
        string tipo
        string soporte
    }
    DISTRIBUCION {
        string nombre
        string funcion_densidad
    }
    PARAMETRO {
        string simbolo
        float valor
    }
    ESTADISTICO {
        string formula
        string interpretacion
    }
    METODO-CALCULO {
        string nombre
        string procedimiento
    }
    MODELO-ESTADISTICO {
        string tipo
        string aplicabilidad
    }
    HIPOTESIS {
        string enunciado
        string prueba
    }`
    }],
    gantt: [
    {
        nombre: "Investigación en Teoría de Números",
        ejemplo: `gantt
    title Cronograma de Investigación en Teoría de Números
    dateFormat  YYYY-MM-DD
    axisFormat %Y-%m
    
    section Revisión Bibliográfica
    Estudio de primos gemelos     :a1, 2024-01-01, 30d
    Análisis de conjeturas        :a2, after a1, 20d
    Compilación de referencias    :a3, after a2, 15d
    
    section Desarrollo Teórico
    Formulación de hipótesis      :b1, after a3, 25d
    Demostración de lemas         :b2, after b1, 40d
    Construcción de argumentos    :b3, after b2, 35d
    
    section Validación
    Pruebas de consistencia       :c1, after b3, 30d
    Revisión por pares            :c2, after c1, 45d
    Correcciones finales          :c3, after c2, 20d
    
    section Publicación
    Redacción del artículo        :d1, after c3, 60d
    Envío a revista               :d2, after d1, 10d
    Revisión y respuesta          :d3, after d2, 90d`
    },
    {
        nombre: "Desarrollo de Algoritmo de Optimización",
        ejemplo: `gantt
    title Desarrollo de Algoritmo de Optimización
    dateFormat  YYYY-MM-DD
    axisFormat %Y-%m
    
    section Diseño Inicial
    Análisis del problema         :a1, 2024-02-01, 20d
    Diseño de la estructura       :a2, after a1, 25d
    Selección de metodología      :a3, after a2, 15d
    
    section Implementación
    Codificación del núcleo       :b1, after a3, 40d
    Optimización de rendimiento   :b2, after b1, 35d
    Integración de módulos        :b3, after b2, 30d
    
    section Pruebas
    Validación teórica            :c1, after b3, 25d
    Pruebas de rendimiento        :c2, after c1, 30d
    Corrección de errores         :c3, after c2, 20d
    
    section Documentación
    Manual de usuario             :d1, after c3, 25d
    Documentación técnica         :d2, after d1, 30d
    Preparación de ejemplos       :d3, after d2, 20d`
    },
    {
        nombre: "Curso de Análisis Complejo",
        ejemplo: `gantt
    title Curso de Análisis Complejo
    dateFormat  YYYY-MM-DD
    axisFormat %Y-%m
    
    section Preparación de Contenido
    Diseño del syllabus           :a1, 2024-03-01, 15d
    Desarrollo de teoría          :a2, after a1, 40d
    Creación de ejercicios        :a3, after a2, 30d
    
    section Material Didáctico
    Elaboración de presentaciones :b1, after a3, 35d
    Grabación de videoclases      :b2, after b1, 45d
    Diseño de evaluaciones        :b3, after b2, 25d
    
    section Implementación
    Plataforma virtual            :c1, after b3, 20d
    Publicación de contenidos     :c2, after c1, 30d
    Configuración de foros        :c3, after c2, 15d
    
    section Ejecución
    Desarrollo del curso          :d1, after c3, 90d
    Tutorías y apoyo              :d2, after d1, 90d
    Evaluación final              :d3, after d2, 30d`
    },
    {
        nombre: "Simulación de Modelos Diferenciales",
        ejemplo: `gantt
    title Simulación de Modelos Diferenciales
    dateFormat  YYYY-MM-DD
    axisFormat %Y-%m
    
    section Modelado Matemático
    Formulación de ecuaciones     :a1, 2024-04-01, 30d
    Análisis de estabilidad       :a2, after a1, 25d
    Definición de parámetros      :a3, after a2, 20d
    
    section Implementación Computacional
    Selección de herramientas     :b1, after a3, 15d
    Programación del modelo       :b2, after b1, 50d
    Optimización numérica         :b3, after b2, 40d
    
    section Experimentación
    Pruebas con datos sintéticos  :c1, after b3, 30d
    Validación con datos reales   :c2, after c1, 45d
    Análisis de sensibilidad      :c3, after c2, 35d
    
    section Análisis de Resultados
    Procesamiento de datos        :d1, after c3, 30d
    Interpretación matemática     :d2, after d1, 40d
    Elaboración de conclusiones   :d3, after d2, 25d`
    },
    {
        nombre: "Investigación en Geometría Algebraica",
        ejemplo: `gantt
    title Investigación en Geometría Algebraica
    dateFormat  YYYY-MM-DD
    axisFormat %Y-%m
    
    section Estudio Teórico
    Revisión de variedades        :a1, 2024-05-01, 40d
    Análisis de haces             :a2, after a1, 35d
    Estudio de cohomología        :a3, after a2, 45d
    
    section Desarrollo
    Formulación de conjeturas     :b1, after a3, 30d
    Construcción de demostraciones :b2, after b1, 60d
    Generalización de resultados  :b3, after b2, 40d
    
    section Colaboración
    Reuniones de trabajo          :c1, after b3, 25d
    Intercambio de ideas          :c2, after c1, 35d
    Desarrollo conjunto           :c3, after c2, 50d
    
    section Divulgación
    Preparación de conferencias   :d1, after c3, 30d
    Redacción de artículos        :d2, after d1, 60d
    Participación en congresos    :d3, after d2, 45d`
    },
    {
        nombre: "Desarrollo de Software para Cálculo Simbólico",
        ejemplo: `gantt
    title Desarrollo de Software para Cálculo Simbólico
    dateFormat  YYYY-MM-DD
    axisFormat %Y-%m
    
    section Diseño
    Especificación de requisitos  :a1, 2024-06-01, 25d
    Arquitectura del sistema      :a2, after a1, 30d
    Diseño de interfaces          :a3, after a2, 20d
    
    section Implementación
    Módulo de álgebra             :b1, after a3, 50d
    Módulo de cálculo             :b2, after b1, 45d
    Módulo de visualización       :b3, after b2, 40d
    
    section Pruebas
    Validación de algoritmos      :c1, after b3, 35d
    Pruebas de usabilidad         :c2, after c1, 30d
    Optimización de rendimiento   :c3, after c2, 25d
    
    section Lanzamiento
    Documentación final           :d1, after c3, 30d
    Empaquetamiento               :d2, after d1, 20d
    Distribución                  :d3, after d2, 15d`
    },
    {
        nombre: "Estudio de Sistemas Dinámicos",
        ejemplo: `gantt
    title Estudio de Sistemas Dinámicos
    dateFormat  YYYY-MM-DD
    axisFormat %Y-%m
    
    section Marco Teórico
    Revisión de literatura        :a1, 2024-07-01, 35d
    Estudio de estabilidad        :a2, after a1, 40d
    Análisis de bifurcaciones     :a3, after a2, 45d
    
    section Investigación
    Formulación de modelos        :b1, after a3, 30d
    Simulación numérica           :b2, after b1, 50d
    Análisis de resultados        :b3, after b2, 40d
    
    section Desarrollo
    Elaboración de teoremas       :c1, after b3, 45d
    Demostraciones formales       :c2, after c1, 60d
    Generalización de resultados  :c3, after c2, 35d
    
    section Publicación
    Preparación de manuscrito     :d1, after c3, 50d
    Revisión por pares            :d2, after d1, 60d
    Difusión de resultados        :d3, after d2, 30d`
    },
    {
        nombre: "Implementación de Algoritmos de Aprendizaje Automático",
        ejemplo: `gantt
    title Implementación de Algoritmos de Aprendizaje Automático
    dateFormat  YYYY-MM-DD
    axisFormat %Y-%m
    
    section Preparación
    Estudio de fundamentos matemáticos :a1, 2024-08-01, 30d
    Selección de algoritmos       :a2, after a1, 25d
    Preparación de datos          :a3, after a2, 20d
    
    section Desarrollo
    Implementación de modelos     :b1, after a3, 45d
    Entrenamiento de redes        :b2, after b1, 50d
    Validación cruzada            :b3, after b2, 35d
    
    section Optimización
    Ajuste de hiperparámetros     :c1, after b3, 40d
    Mejora de rendimiento         :c2, after c1, 30d
    Pruebas de robustez           :c3, after c2, 25d
    
    section Despliegue
    Integración del sistema       :d1, after c3, 30d
    Pruebas de producción         :d2, after d1, 25d
    Monitoreo continuo            :d3, after d2, 35d`
    },
    {
        nombre: "Investigación en Topología Algebraica",
        ejemplo: `gantt
    title Investigación en Topología Algebraica
    dateFormat  YYYY-MM-DD
    axisFormat %Y-%m
    
    section Estudio Fundamental
    Revisión de grupos de homotopía :a1, 2024-09-01, 40d
    Análisis de homologías        :a2, after a1, 45d
    Estudio de cohomologías       :a3, after a2, 50d
    
    section Desarrollo Teórico
    Formulación de conjeturas     :b1, after a3, 35d
    Construcción de demostraciones :b2, after b1, 60d
    Generalización de teoremas    :b3, after b2, 45d
    
    section Aplicaciones
    Conexiones con geometría      :c1, after b3, 40d
    Aplicaciones en física        :c2, after c1, 50d
    Implementaciones computacionales :c3, after c2, 35d
    
    section Divulgación
    Preparación de artículos      :d1, after c3, 60d
    Presentación en conferencias  :d2, after d1, 45d
    Organización de seminarios    :d3, after d2, 30d`
    },
    {
        nombre: "Matemáticas Aplicadas a Finanzas",
        ejemplo: `gantt
    title Proyecto de Matemáticas Aplicadas a Finanzas
    dateFormat  YYYY-MM-DD
    axisFormat %Y-%m
    
    section Modelado
    Análisis de series temporales :a1, 2024-10-01, 30d
    Desarrollo de modelos estocásticos :a2, after a1, 40d
    Calibración de parámetros     :a3, after a2, 35d
    
    section Simulación
    Implementación de Monte Carlo :b1, after a3, 45d
    Pruebas de estrés             :b2, after b1, 40d
    Análisis de escenarios        :b3, after b2, 35d
    
    section Optimización
    Desarrollo de estrategias     :c1, after b3, 40d
    Optimización de portafolios   :c2, after c1, 45d
    Gestión de riesgos            :c3, after c2, 35d
    
    section Implementación
    Integración con sistemas existentes :d1, after c3, 30d
    Pruebas de validación         :d2, after d1, 25d
    Despliegue en producción      :d3, after d2, 20d`
    }],
    pie: [
    {
        nombre: "Distribución de Tipos de Números",
        ejemplo: `pie title Distribución de Tipos de Números en ℝ
    "Enteros (ℤ)" : 15
    "Racionales (ℚ)" : 25
    "Irracionales Algebraicos" : 30
    "Irracionales Transcendentes" : 30`
    },
    {
        nombre: "Clasificación de Funciones Elementales",
        ejemplo: `pie title Clasificación de Funciones Elementales
    "Polinómicas" : 35
    "Exponenciales" : 20
    "Logarítmicas" : 15
    "Trigonométricas" : 20
    "Hiperbólicas" : 10`
    },
    {
        nombre: "Distribución de Áreas Matemáticas",
        ejemplo: `pie title Distribución de Principales Áreas Matemáticas
    "Álgebra" : 25
    "Análisis" : 25
    "Geometría" : 20
    "Topología" : 15
    "Matemática Discreta" : 15`
    },
    {
        nombre: "Probabilidad de Distribuciones",
        ejemplo: `pie title Distribuciones de Probabilidad Comunes
    "Normal" : 40
    "Binomial" : 20
    "Poisson" : 15
    "Exponencial" : 15
    "Uniforme" : 10`
    },
    {
        nombre: "Tipos de Matrices",
        ejemplo: `pie title Clasificación de Matrices Cuadradas
    "Regulares" : 60
    "Singulares" : 25
    "Simétricas" : 10
    "Ortogonales" : 5`
    },
    {
        nombre: "Constantes Matemáticas Importantes",
        ejemplo: `pie title Proporción de Aparición de Constantes
    "π (Pi)" : 35
    "e (Euler)" : 25
    "φ (Áureo)" : 15
    "γ (Euler-Mascheroni)" : 10
    "√2" : 15`
    },
    {
        nombre: "Métodos de Integración",
        ejemplo: `pie title Frecuencia de Uso de Métodos de Integración
    "Sustitución" : 40
    "Partes" : 25
    "Fracciones Parciales" : 20
    "Sustitución Trigonométrica" : 15`
    },
    {
        nombre: "Tipos de Ecuaciones Diferenciales",
        ejemplo: `pie title Clasificación de Ecuaciones Diferenciales
    "Ordinarias" : 60
    "En Derivadas Parciales" : 30
    "Estocásticas" : 10`
    },
    {
        nombre: "Números Primos Especiales",
        ejemplo: `pie title Distribución de Números Primos Especiales
    "Primos Gemelos" : 30
    "Primos de Mersenne" : 20
    "Primos de Fermat" : 15
    "Primos Factoriales" : 15
    "Primos de Sophie Germain" : 20`
    },
    {
        nombre: "Teoremas Fundamentales",
        ejemplo: `pie title Aplicación de Teoremas Fundamentales
    "Teorema Fundamental del Cálculo" : 35
    "Teorema Fundamental del Álgebra" : 25
    "Teorema Fundamental de Aritmética" : 20
    "Teorema Fundamental de Galois" : 20`
    }],
    quadrant: [
    {
        nombre: "Clasificación de Funciones por Continuidad y Derivabilidad",
        ejemplo: `quadrantChart
    title "Clasificación de Funciones Matemáticas"
    x-axis "Discontinua" --> "Continua"
    y-axis "No Derivable" --> "Derivable"
    quadrant-1 "Continuas y Derivables"
    quadrant-2 "Continuas pero no Derivables"
    quadrant-3 "Discontinuas y no Derivables"
    quadrant-4 "Discontinuas pero Derivables (en puntos)"
    "f(x) = x²": [0.8, 0.9]
    "f(x) = |x|": [0.7, 0.3]
    "f(x) = 1/x": [0.2, 0.2]
    "f(x) = sen(1/x)": [0.3, 0.4]
    "f(x) = e^x": [0.9, 0.95]
    "Función de Weierstrass": [0.6, 0.1]`
    },
    {
        nombre: "Clasificación de Sistemas de Ecuaciones",
        ejemplo: `quadrantChart
    title "Clasificación de Sistemas de Ecuaciones Lineales"
    x-axis "Incompatible" --> "Compatible"
    y-axis "Indeterminado" --> "Determinado"
    quadrant-1 "Compatible Determinado"
    quadrant-2 "Compatible Indeterminado"
    quadrant-3 "Incompatible Indeterminado"
    quadrant-4 "Incompatible Determinado"
    "2x + 3y = 5": [0.9, 0.9]
    "x + y = 1, 2x + 2y = 2": [0.8, 0.2]
    "x + y = 1, x + y = 2": [0.1, 0.5]
    "3x - y = 0, 6x - 2y = 0": [0.7, 0.3]
    "Sistema homogéneo": [0.6, 0.4]`
    },
    {
        nombre: "Análisis de Métodos Numéricos",
        ejemplo: `quadrantChart
    title "Evaluación de Métodos Numéricos"
    x-axis "Baja Precisión" --> "Alta Precisión"
    y-axis "Lenta Convergencia" --> "Rápida Convergencia"
    quadrant-1 "Alta Precisión, Rápida Convergencia"
    quadrant-2 "Alta Precisión, Lenta Convergencia"
    quadrant-3 "Baja Precisión, Lenta Convergencia"
    quadrant-4 "Baja Precisión, Rápida Convergencia"
    "Método de Newton": [0.9, 0.9]
    "Bisección": [0.7, 0.3]
    "Secante": [0.8, 0.7]
    "Punto Fijo": [0.4, 0.6]
    "Regula Falsi": [0.6, 0.5]`
    },
    {
        nombre: "Clasificación de Series Matemáticas",
        ejemplo: `quadrantChart
    title "Comportamiento de Series Infinitas"
    x-axis "Divergente" --> "Convergente"
    y-axis "Condicionalmente Convergente" --> "Absolutamente Convergente"
    quadrant-1 "Convergente Absolutamente"
    quadrant-2 "Convergente Condicionalmente"
    quadrant-3 "Divergente Condicionalmente"
    quadrant-4 "Divergente Absolutamente"
    "Σ 1/n²": [0.9, 0.9]
    "Σ (-1)^n/n": [0.8, 0.2]
    "Σ 1/n": [0.1, 0.1]
    "Σ (-1)^n/√n": [0.7, 0.3]
    "Σ n!": [0.05, 0.05]`
    },
    {
        nombre: "Evaluación de Algoritmos de Optimización",
        ejemplo: `quadrantChart
    title "Rendimiento de Algoritmos de Optimización"
    x-axis "Baja Eficiencia" --> "Alta Eficiencia"
    y-axis "Poca Precisión" --> "Alta Precisión"
    quadrant-1 "Alta Eficiencia y Precisión"
    quadrant-2 "Alta Precisión, Baja Eficiencia"
    quadrant-3 "Baja Eficiencia y Precisión"
    quadrant-4 "Alta Eficiencia, Baja Precisión"
    "Gradiente Conjugado": [0.9, 0.9]
    "Newton-Raphson": [0.8, 0.95]
    "Descenso de Gradiente": [0.6, 0.7]
    "Algoritmo Genético": [0.4, 0.6]
    "Búsqueda Aleatoria": [0.2, 0.3]`
    },
    {
        nombre: "Clasificación de Espacios Métricos",
        ejemplo: `quadrantChart
    title "Propiedades de Espacios Métricos"
    x-axis "No Completo" --> "Completo"
    y-axis "No Compacto" --> "Compacto"
    quadrant-1 "Completo y Compacto"
    quadrant-2 "Completo pero no Compacto"
    quadrant-3 "No Completo ni Compacto"
    quadrant-4 "Compacto pero no Completo"
    "ℝ con métrica usual": [0.9, 0.1]
    "[0,1] con métrica usual": [0.95, 0.95]
    "ℚ con métrica usual": [0.1, 0.1]
    "Espacio discreto finito": [0.8, 0.9]
    "Espacio de funciones continuas": [0.9, 0.2]`
    },
    {
        nombre: "Análisis de Distribuciones Probabilísticas",
        ejemplo: `quadrantChart
    title "Características de Distribuciones de Probabilidad"
    x-axis "Baja Curtosis" --> "Alta Curtosis"
    y-axis "Simétrica" --> "Asimétrica"
    quadrant-1 "Alta Curtosis, Asimétrica"
    quadrant-2 "Alta Curtosis, Simétrica"
    quadrant-3 "Baja Curtosis, Simétrica"
    quadrant-4 "Baja Curtosis, Asimétrica"
    "Normal Estándar": [0.5, 0.5]
    "Binomial (n=10, p=0.5)": [0.4, 0.5]
    "Exponencial": [0.3, 0.8]
    "Poisson (λ=1)": [0.6, 0.6]
    "Chi-cuadrado (k=3)": [0.7, 0.7]`
    },
    {
        nombre: "Clasificación de Matrices",
        ejemplo: `quadrantChart
    title "Propiedades de Matrices Cuadradas"
    x-axis "No Invertible" --> "Invertible"
    y-axis "No Diagonalizable" --> "Diagonalizable"
    quadrant-1 "Invertible y Diagonalizable"
    quadrant-2 "Invertible pero no Diagonalizable"
    quadrant-3 "No Invertible ni Diagonalizable"
    quadrant-4 "Diagonalizable pero no Invertible"
    "Matriz Identidad": [0.95, 0.95]
    "Matriz de Rotación": [0.9, 0.9]
    "Matriz Nilpotente": [0.1, 0.1]
    "Matriz Proyección": [0.5, 0.9]
    "Matriz Singular": [0.1, 0.5]`
    },
    {
        nombre: "Evaluación de Métodos de Integración",
        ejemplo: `quadrantChart
    title "Efectividad de Métodos de Integración Numérica"
    x-axis "Baja Precisión" --> "Alta Precisión"
    y-axis "Alto Coste Computacional" --> "Bajo Coste Computacional"
    quadrant-1 "Alta Precisión, Bajo Coste"
    quadrant-2 "Alta Precisión, Alto Coste"
    quadrant-3 "Baja Precisión, Alto Coste"
    quadrant-4 "Baja Precisión, Bajo Coste"
    "Cuadratura de Gauss": [0.95, 0.9]
    "Regla de Simpson": [0.8, 0.8]
    "Regla del Trapecio": [0.6, 0.7]
    "Monte Carlo": [0.4, 0.3]
    "Método de Romberg": [0.9, 0.6]`
    },
    {
        nombre: "Clasificación de Problemas de Optimización",
        ejemplo: `quadrantChart
    title "Complejidad de Problemas de Optimización"
    x-axis "No Convexo" --> "Convexo"
    y-axis "Múltiples Mínimos" --> "Único Mínimo"
    quadrant-1 "Convexo con Único Mínimo"
    quadrant-2 "Convexo con Múltiples Mínimos"
    quadrant-3 "No Convexo con Múltiples Mínimos"
    quadrant-4 "No Convexo con Único Mínimo"
    "Programación Lineal": [0.95, 0.95]
    "Mínimos Cuadrados": [0.9, 0.9]
    "Optimización No Lineal General": [0.3, 0.4]
    "Problema del Viajante": [0.1, 0.1]
    "Optimización Restringida": [0.6, 0.7]`
    }],
    gitGraph: [
    {
        nombre: "Desarrollo de Biblioteca de Álgebra Lineal",
        ejemplo: `gitGraph
    commit id: "Inicio proyecto"
    branch desarrollo
    checkout desarrollo
    commit id: "Implementación de matrices"
    commit id: "Operaciones básicas"
    branch feature-determinantes
    checkout feature-determinantes
    commit id: "Algoritmo para determinantes 2x2"
    commit id: "Extensión a matrices nxn"
    checkout desarrollo
    merge feature-determinantes id: "Merge determinantes"
    branch feature-autovalores
    checkout feature-autovalores
    commit id: "Cálculo de autovalores"
    commit id: "Método de Jacobi"
    checkout desarrollo
    merge feature-autovalores id: "Merge autovalores"
    commit id: "Optimización general"
    checkout main
    merge desarrollo id: "Release v1.0"`
    },
    {
        nombre: "Proyecto de Cálculo Simbólico",
        ejemplo: `gitGraph
    commit id: "Inicialización repositorio"
    branch derivadas
    checkout derivadas
    commit id: "Derivadas polinómicas"
    commit id: "Regla de la cadena"
    branch integrales
    checkout integrales
    commit id: "Integrales básicas"
    commit id: "Método de sustitución"
    checkout derivadas
    commit id: "Derivadas trigonométricas"
    checkout main
    merge derivadas id: "Merge módulo derivadas"
    merge integrales id: "Merge módulo integrales"
    branch ecuaciones
    checkout ecuaciones
    commit id: "Solución de ecuaciones lineales"
    commit id: "Ecuaciones diferenciales"
    checkout main
    merge ecuaciones id: "Release cálculo simbólico"`
    },
    {
        nombre: "Sistema de Visualización Matemática",
        ejemplo: `gitGraph
    commit id: "Commit inicial"
    branch graficos-2d
    checkout graficos-2d
    commit id: "Funciones cartesianas"
    commit id: "Graficación de ecuaciones"
    branch graficos-3d
    checkout graficos-3d
    commit id: "Superficies 3D"
    commit id: "Curvas paramétricas"
    checkout graficos-2d
    commit id: "Soporte para coordenadas polares"
    checkout main
    merge graficos-2d id: "Merge gráficos 2D"
    merge graficos-3d id: "Merge gráficos 3D"
    branch animaciones
    checkout animaciones
    commit id: "Animación de funciones"
    commit id: "Visualización de límites"
    checkout main
    merge animaciones id: "Release visualización"`
    },
    {
        nombre: "Framework de Machine Learning Matemático",
        ejemplo: `gitGraph
    commit id: "Inicio del proyecto"
    branch modelos-lineales
    checkout modelos-lineales
    commit id: "Regresión lineal"
    commit id: "Clasificación lineal"
    branch redes-neuronales
    checkout redes-neuronales
    commit id: "Perceptrón simple"
    commit id: "Backpropagation"
    checkout modelos-lineales
    commit id: "Regularización L1/L2"
    checkout main
    merge modelos-lineales id: "Merge modelos lineales"
    merge redes-neuronales id: "Merge redes neuronales"
    branch optimizadores
    checkout optimizadores
    commit id: "SGD"
    commit id: "Adam optimizer"
    checkout main
    merge optimizadores id: "Release ML framework"`
    },
    {
        nombre: "Biblioteca de Teoría de Números",
        ejemplo: `gitGraph
    commit id: "Primer commit"
    branch primalidad
    checkout primalidad
    commit id: "Test de primalidad básico"
    commit id: "Criba de Eratóstenes"
    branch factorizacion
    checkout factorizacion
    commit id: "Factorización por fuerza bruta"
    commit id: "Algoritmo ρ de Pollard"
    checkout primalidad
    commit id: "Test de Miller-Rabin"
    checkout main
    merge primalidad id: "Merge primalidad"
    merge factorizacion id: "Merge factorización"
    branch criptografia
    checkout criptografia
    commit id: "RSA básico"
    commit id: "Diffie-Hellman"
    checkout main
    merge criptografia id: "Release criptografía"`
    },
    {
        nombre: "Herramientas de Estadística Matemática",
        ejemplo: `gitGraph
    commit id: "Inicio repositorio"
    branch distribuciones
    checkout distribuciones
    commit id: "Distribución normal"
    commit id: "Distribuciones continuas"
    branch inferencia
    checkout inferencia
    commit id: "Intervalos de confianza"
    commit id: "Tests de hipótesis"
    checkout distribuciones
    commit id: "Distribuciones discretas"
    checkout main
    merge distribuciones id: "Merge distribuciones"
    merge inferencia id: "Merge inferencia"
    branch modelos
    checkout modelos
    commit id: "Regresión lineal"
    commit id: "ANOVA"
    checkout main
    merge modelos id: "Release estadística"`
    },
    {
        nombre: "Sistema de Geometría Computacional",
        ejemplo: `gitGraph
    commit id: "Commit inicial"
    branch algoritmos-basicos
    checkout algoritmos-basicos
    commit id: "Punto en polígono"
    commit id: "Cálculo de convex hull"
    branch algoritmos-avanzados
    checkout algoritmos-avanzados
    commit id: "Triangulación de Delaunay"
    commit id: "Diagramas de Voronoi"
    checkout algoritmos-basicos
    commit id: "Intersección de segmentos"
    checkout main
    merge algoritmos-basicos id: "Merge algoritmos básicos"
    merge algoritmos-avanzados id: "Merge algoritmos avanzados"
    branch aplicaciones
    checkout aplicaciones
    commit id: "Visualización geométrica"
    commit id: "Aplicaciones CAD"
    checkout main
    merge aplicaciones id: "Release geometría computacional"`
    },
    {
        nombre: "Plataforma de Educación Matemática",
        ejemplo: `gitGraph
    commit id: "Inicio plataforma"
    branch contenido-algebra
    checkout contenido-algebra
    commit id: "Lecciones de álgebra básica"
    commit id: "Ejercicios interactivos"
    branch contenido-calculo
    checkout contenido-calculo
    commit id: "Límites y derivadas"
    commit id: "Integrales y aplicaciones"
    checkout contenido-algebra
    commit id: "Sistemas de ecuaciones"
    checkout main
    merge contenido-algebra id: "Merge álgebra"
    merge contenido-calculo id: "Merge cálculo"
    branch evaluacion
    checkout evaluacion
    commit id: "Sistema de quizzes"
    commit id: "Seguimiento de progreso"
    checkout main
    merge evaluacion id: "Release plataforma educativa"`
    },
    {
        nombre: "Motor de Física Matemática",
        ejemplo: `gitGraph
    commit id: "Primer commit motor"
    branch cinematica
    checkout cinematica
    commit id: "Movimiento rectilíneo"
    commit id: "Movimiento parabólico"
    branch dinamica
    checkout dinamica
    commit id: "Leyes de Newton"
    commit id: "Sistemas de partículas"
    checkout cinematica
    commit id: "Movimiento circular"
    checkout main
    merge cinematica id: "Merge cinemática"
    merge dinamica id: "Merge dinámica"
    branch campos
    checkout campos
    commit id: "Campo gravitatorio"
    commit id: "Campo electromagnético"
    checkout main
    merge campos id: "Release motor físico"`
    }],
    c4: [
    {
        nombre: "Sistema de Cálculo Simbólico - Contexto",
        ejemplo: `C4Context
    title Sistema de Cálculo Simbólico - Diagrama de Contexto

    Person(estudiante, "Estudiante", "Usuario que necesita resolver problemas matemáticos")
    Person(profesor, "Profesor", "Educador que crea ejercicios y verifica soluciones")
    Person(investigador, "Investigador", "Científico que realiza cálculos complejos")

    System(sistema_calculo, "Sistema de Cálculo Simbólico", "Procesa y resuelve expresiones matemáticas")

    Rel(estudiante, sistema_calculo, "Resuelve problemas matemáticos")
    Rel(profesor, sistema_calculo, "Verifica soluciones y crea ejercicios")
    Rel(investigador, sistema_calculo, "Realiza cálculos complejos")

    System_Ext(biblioteca_matematica, "Biblioteca Matemática", "Provee algoritmos fundamentales")
    System_Ext(almacenamiento, "Sistema de Almacenamiento", "Guarda historial de cálculos")

    Rel(sistema_calculo, biblioteca_matematica, "Utiliza funciones matemáticas")
    Rel(sistema_calculo, almacenamiento, "Guarda y recupera resultados")`
    },
    {
        nombre: "Sistema de Cálculo Simbólico - Contenedores",
        ejemplo: `C4Container
    title Sistema de Cálculo Simbólico - Diagrama de Contenedores

    Person(usuario, "Usuario", "Interactúa con el sistema")

    System_Boundary(sistema, "Sistema de Cálculo Simbólico") {
        Container(web_app, "Aplicación Web", "React", "Interfaz de usuario para ingresar expresiones")
        Container(api, "API REST", "Python/FastAPI", "Procesa solicitudes de cálculo")
        Container(motor_simbolico, "Motor Simbólico", "SymPy", "Realiza manipulaciones algebraicas")
        Container(base_datos, "Base de Datos", "PostgreSQL", "Almacena historial de cálculos")
    }

    Rel(usuario, web_app, "Ingresa expresiones matemáticas")
    Rel(web_app, api, "Envía expresiones para procesar")
    Rel(api, motor_simbolico, "Solicita cálculo simbólico")
    Rel(api, base_datos, "Almacena y recupera resultados")
    Rel(motor_simbolico, api, "Devuelve resultados calculados")`
    },
    {
        nombre: "Plataforma de Educación Matemática - Componentes",
        ejemplo: `C4Component
    title Plataforma de Educación Matemática - Diagrama de Componentes

    Container(plataforma, "Plataforma Educativa", "Python/Django", "Sistema de aprendizaje matemático")

    Component(web_ui, "Interfaz Web", "React", "Provee interfaz de usuario")
    Component(auth_service, "Servicio de Autenticación", "Django Auth", "Maneja usuarios y permisos")
    Component(problemas_service, "Servicio de Problemas", "Python", "Genera y valida ejercicios")
    Component(progreso_service, "Servicio de Progreso", "Python", "Monitorea avance estudiantil")
    Component(analytics_service, "Servicio de Analytics", "Python", "Analiza rendimiento estudiantil")

    Rel(web_ui, auth_service, "Autentica usuarios")
    Rel(web_ui, problemas_service, "Solicita problemas matemáticos")
    Rel(web_ui, progreso_service, "Consulta progreso estudiantil")
    Rel(problemas_service, progreso_service, "Registra resultados de ejercicios")
    Rel(progreso_service, analytics_service, "Envía datos para análisis")`
    },
    {
        nombre: "Sistema de Visualización Matemática - Contexto",
        ejemplo: `C4Context
    title Sistema de Visualización Matemática - Diagrama de Contexto

    Person(estudiante, "Estudiante", "Visualiza conceptos matemáticos")
    Person(profesor, "Profesor", "Crea materiales visuales educativos")
    Person(investigador, "Investigador", "Analiza datos matemáticos complejos")

    System(sistema_visualizacion, "Sistema de Visualización Matemática", "Genera gráficos y representaciones visuales")

    Rel(estudiante, sistema_visualizacion, "Visualiza funciones y conceptos")
    Rel(profesor, sistema_visualizacion, "Crea materiales educativos")
    Rel(investigador, sistema_visualizacion, "Analiza datos matemáticos")

    System_Ext(renderizador, "Motor de Renderizado", "Procesa gráficos 2D/3D")
    System_Ext(almacenamiento_datos, "Almacenamiento de Datos", "Guarda visualizaciones")

    Rel(sistema_visualizacion, renderizador, "Solicita renderizado de gráficos")
    Rel(sistema_visualizacion, almacenamiento_datos, "Guarda y recupera visualizaciones")`
    },
    {
        nombre: "Biblioteca de Algoritmos Numéricos - Contenedores",
        ejemplo: `C4Container
    title Biblioteca de Algoritmos Numéricos - Diagrama de Contenedores

    Person(desarrollador, "Desarrollador", "Utiliza la biblioteca en aplicaciones")

    System_Boundary(biblioteca, "Biblioteca de Algoritmos Numéricos") {
        Container(api_python, "API Python", "Python", "Interfaz principal para desarrolladores")
        Container(modulo_algebra, "Módulo de Álgebra Lineal", "C++", "Operaciones matriciales y vectoriales")
        Container(modulo_optimizacion, "Módulo de Optimización", "C++", "Algoritmos de optimización")
        Container(modulo_ecuaciones, "Módulo de Ecuaciones", "C++", "Resolución de ecuaciones diferenciales")
        Container(modulo_estadistica, "Módulo de Estadística", "C++", "Cálculos estadísticos")
    }

    Rel(desarrollador, api_python, "Utiliza funciones de la biblioteca")
    Rel(api_python, modulo_algebra, "Ejecuta operaciones algebraicas")
    Rel(api_python, modulo_optimizacion, "Resuelve problemas de optimización")
    Rel(api_python, modulo_ecuaciones, "Resuelve ecuaciones diferenciales")
    Rel(api_python, modulo_estadistica, "Realiza cálculos estadísticos")`
    },
    {
        nombre: "Sistema de Resolución de Ecuaciones - Componentes",
        ejemplo: `C4Component
    title Sistema de Resolución de Ecuaciones - Diagrama de Componentes

    Container(sistema_ecuaciones, "Sistema de Resolución de Ecuaciones", "Python", "Resuelve ecuaciones matemáticas")

    Component(parser, "Parser Matemático", "ANTLR", "Interpreta expresiones matemáticas")
    Component(simplificador, "Simplificador", "Python", "Simplifica expresiones algebraicas")
    Component(resolver_lineales, "Resolvedor Lineal", "Python", "Resuelve sistemas lineales")
    Component(resolver_no_lineales, "Resolvedor No Lineal", "Python", "Resuelve ecuaciones no lineales")
    Component(visualizador, "Visualizador de Soluciones", "Matplotlib", "Genera gráficos de soluciones")

    Rel(parser, simplificador, "Envía expresiones parseadas")
    Rel(simplificador, resolver_lineales, "Deriva a resolvedor lineal")
    Rel(simplificador, resolver_no_lineales, "Deriva a resolvedor no lineal")
    Rel(resolver_lineales, visualizador, "Envía soluciones para visualización")
    Rel(resolver_no_lineales, visualizador, "Envía soluciones para visualización")`
    },
    {
        nombre: "Plataforma de Matemáticas Colaborativa - Contexto",
        ejemplo: `C4Context
    title Plataforma de Matemáticas Colaborativa - Diagrama de Contexto

    Person(estudiante, "Estudiante", "Aprende matemáticas colaborativamente")
    Person(profesor, "Profesor", "Dirige grupos de estudio")
    Person(editor, "Editor", "Crea y revisa contenido matemático")

    System(plataforma_colaborativa, "Plataforma Matemática Colaborativa", "Facilita el aprendizaje grupal")

    Rel(estudiante, plataforma_colaborativa, "Participa en grupos de estudio")
    Rel(profesor, plataforma_colaborativa, "Coordina actividades educativas")
    Rel(editor, plataforma_colaborativa, "Crea y mantiene contenido")

    System_Ext(auth_provider, "Proveedor de Autenticación", "Gestiona identidades de usuario")
    System_Ext(cloud_storage, "Almacenamiento en Cloud", "Guarda documentos colaborativos")

    Rel(plataforma_colaborativa, auth_provider, "Autentica usuarios")
    Rel(plataforma_colaborativa, cloud_storage, "Almacena y recupera documentos")`
    },
    {
        nombre: "Motor de Geometría Computacional - Contenedores",
        ejemplo: `C4Container
    title Motor de Geometría Computacional - Diagrama de Contenedores

    Person(usuario, "Usuario", "Utiliza funciones geométricas")

    System_Boundary(motor_geometria, "Motor de Geometría Computacional") {
        Container(api_principal, "API Principal", "C++", "Interfaz de programación")
        Container(modulo_2d, "Módulo 2D", "C++", "Operaciones geométricas bidimensionales")
        Container(modulo_3d, "Módulo 3D", "C++", "Operaciones geométricas tridimensionales")
        Container(modulo_colisiones, "Módulo de Colisiones", "C++", "Detección de colisiones")
        Container(modulo_visualizacion, "Módulo de Visualización", "OpenGL", "Renderizado geométrico")
    }

    Rel(usuario, api_principal, "Utiliza funciones geométricas")
    Rel(api_principal, modulo_2d, "Ejecuta operaciones 2D")
    Rel(api_principal, modulo_3d, "Ejecuta operaciones 3D")
    Rel(api_principal, modulo_colisiones, "Verifica colisiones")
    Rel(api_principal, modulo_visualizacion, "Solicita visualizaciones")`
    },
    {
        nombre: "Sistema de Análisis Estadístico - Componentes",
        ejemplo: `C4Component
    title Sistema de Análisis Estadístico - Diagrama de Componentes

    Container(sistema_estadistico, "Sistema de Análisis Estadístico", "R/Python", "Procesa datos estadísticos")

    Component(importador_datos, "Importador de Datos", "Python", "Carga y preprocesa datos")
    Component(calculador_estadisticas, "Calculador de Estadísticas", "R", "Calcula medidas estadísticas")
    Component(generador_modelos, "Generador de Modelos", "R", "Crea modelos estadísticos")
    Component(visualizador_datos, "Visualizador de Datos", "Python", "Genera gráficos estadísticos")
    Component(exportador_resultados, "Exportador de Resultados", "Python", "Exporta resultados en varios formatos")

    Rel(importador_datos, calculador_estadisticas, "Provee datos procesados")
    Rel(importador_datos, generador_modelos, "Provee datos para modelado")
    Rel(calculador_estadisticas, visualizador_datos, "Envía estadísticas para visualización")
    Rel(generador_modelos, visualizador_datos, "Envía modelos para visualización")
    Rel(visualizador_datos, exportador_resultados, "Envía gráficos para exportación")`
    },
    {
        nombre: "Sistema de Aprendizaje Automático Matemático - Contexto",
        ejemplo: `C4Context
    title Sistema de Aprendizaje Automático Matemático - Diagrama de Contexto

    Person(cientifico, "Científico de Datos", "Desarrolla modelos matemáticos")
    Person(ingeniero, "Ingeniero de ML", "Implementa pipelines de aprendizaje automático")
    Person(analista, "Analista", "Interpreta resultados de modelos")

    System(sistema_ml_matematico, "Sistema de ML Matemático", "Entrena y evalúa modelos matemáticos")

    Rel(cientifico, sistema_ml_matematico, "Desarrolla modelos matemáticos")
    Rel(ingeniero, sistema_ml_matematico, "Implementa pipelines de ML")
    Rel(analista, sistema_ml_matematico, "Analiza resultados de modelos")

    System_Ext(almacenamiento_datos, "Almacenamiento de Datos", "Almacena datasets de entrenamiento")
    System_Ext(cluster_computo, "Cluster de Cómputo", "Provee capacidad de procesamiento")

    Rel(sistema_ml_matematico, almacenamiento_datos, "Accede a datos de entrenamiento")
    Rel(sistema_ml_matematico, cluster_computo, "Utiliza recursos de cómputo")`
    }],
    mindmap: [
    {
        nombre: "Áreas Principales de las Matemáticas",
        ejemplo: `mindmap
    root((Matemáticas))
      ::icon(fa fa-calculator)
        Álgebra
          Álgebra Lineal
          Teoría de Grupos
          Teoría de Anillos
          Teoría de Campos
        Análisis
          Cálculo
          Análisis Real
          Análisis Complejo
          Ecuaciones Diferenciales
        Geometría
          Geometría Euclidiana
          Geometría Diferencial
          Topología
          Geometría Algebraica
        Matemática Discreta
          Teoría de Números
          Combinatoria
          Teoría de Grafos
          Lógica Matemática
        Probabilidad y Estadística
          Probabilidad
          Estadística
          Procesos Estocásticos
          Inferencia Estadística
        Matemática Aplicada
          Optimización
          Matemática Computacional
          Investigación de Operaciones
          Matemática Financiera`
    },
    {
        nombre: "Teorema Fundamental del Cálculo",
        ejemplo: `mindmap
    root((TFC))
      ::icon(fa fa-integral)
        Parte 1
          Derivada de integral
          d/dx ∫ₐˣ f(t) dt = f(x)
          Conexión derivada-integral
        Parte 2
          Integral de derivada
          ∫ₐᵇ f'(x) dx = f(b) - f(a)
          Cálculo de integrales definidas
        Aplicaciones
          Cálculo de áreas
          Solución de ecuaciones diferenciales
          Teorema de Stokes
          Teorema de Green
        Generalizaciones
          Varias variables
          Formas diferenciales
          Análisis complejo
          Medida e integración`
    },
    {
        nombre: "Estructuras Algebraicas",
        ejemplo: `mindmap
    root((Estructuras Algebraicas))
      ::icon(fa fa-sitemap)
        Grupos
          Operación binaria
          Asociatividad
          Elemento identidad
          Elemento inverso
        Anillos
          Dos operaciones
          Grupo abeliano para suma
          Monoide para multiplicación
          Distributividad
        Campos
          Anillo conmutativo
          Elemento inverso multiplicativo
          ℝ, ℚ, ℂ
          Aritmética y ecuaciones
        Espacios Vectoriales
          Campos y vectores
          Suma vectorial
          Multiplicación por escalar
          Base y dimensión
        Álgebras
          Espacio vectorial
          Multiplicación bilineal
          Álgebra de Lie
          Álgebra asociativa`
    },
    {
        nombre: "Tipos de Números",
        ejemplo: `mindmap
    root((Números))
      ::icon(fa fa-hashtag)
        Naturales (ℕ)
          Cardinalidad
          Inducción matemática
          Aritmética básica
        Enteros (ℤ)
          Números negativos
          Anillo conmutativo
          Valor absoluto
        Racionales (ℚ)
          Fracciones
          Decimales periódicos
          Cuerpo de números
        Reales (ℝ)
          Completitud
          Números irracionales
          Topología usual
        Complejos (ℂ)
          Unidad imaginaria
          Plano complejo
          Teorema fundamental
        Extensiones
          Cuaterniones
          Octoniones
          Números p-ádicos
          Surreales`
    },
    {
        nombre: "Probabilidad y Estadística",
        ejemplo: `mindmap
    root((Probabilidad y Estadística))
      ::icon(fa fa-chart-bar)
        Probabilidad
          Espacios muestrales
          Variables aleatorias
          Distribuciones
          Teoremas límite
        Estadística Descriptiva
          Medidas de tendencia central
          Medidas de dispersión
          Gráficos y visualización
          Correlación
        Estadística Inferencial
          Estimación
          Tests de hipótesis
          Intervalos de confianza
          Regresión
        Distribuciones
          Normal
          Binomial
          Poisson
          Exponencial
        Procesos Estocásticos
          Cadenas de Markov
          Proceso de Poisson
          Movimiento Browniano
          Teoría de colas`
    },
    {
        nombre: "Teoría de Números",
        ejemplo: `mindmap
    root((Teoría de Números))
      ::icon(fa fa-superscript)
        División
          Números primos
          Máximo común divisor
          Algoritmo de Euclides
          Teorema fundamental
        Congruencias
          Aritmética modular
          Teorema chino del resto
          Pequeño teorema de Fermat
          Teorema de Euler
        Formas cuadráticas
          Sumas de cuadrados
          Teorema de los cuatro cuadrados
          Formas modulares
          Representación de números
        Teoría analítica
          Función zeta de Riemann
          Teorema de los números primos
          L-funciones
          Hipótesis de Riemann
        Teoría algebraica
          Campos de números
          Anillos de enteros
          Ideales y divisibilidad
          Teoría de Galois`
    },
    {
        nombre: "Análisis Complejo",
        ejemplo: `mindmap
    root((Análisis Complejo))
      ::icon(fa fa-infinity)
        Funciones complejas
          Variable compleja
          Límites y continuidad
          Derivada compleja
          Ecuaciones Cauchy-Riemann
        Integración compleja
          Integral de contorno
          Teorema de Cauchy
          Fórmula integral
          Teorema del residuo
        Series
          Series de potencias
          Series de Laurent
          Radio de convergencia
          Singularidades
        Transformaciones
          Transformada de Fourier
          Transformada de Laplace
          Transformada Z
          Aplicaciones conformes
        Funciones especiales
          Función gamma
          Función zeta
          Funciones elípticas
          Funciones modulares`
    },
    {
        nombre: "Topología",
        ejemplo: `mindmap
    root((Topología))
      ::icon(fa fa-project-diagram)
        Espacios topológicos
          Conjuntos abiertos
          Bases y sub-bases
          Continuidad
          Homeomorfismos
        Propiedades topológicas
          Conectividad
          Compacidad
          Separación
          Metrizabilidad
        Topología algebraica
          Grupos de homotopía
          Grupos de homología
          Teoría de homotopía
          Teoría de cobordismo
        Variedades
          Variedades diferenciables
          Fibrados
          Geometría riemanniana
          Topología de dimensiones
        Topología general
          Espacios de funciones
          Topologías débiles
          Teoremas de punto fijo
          Teoría de dimensión`
    },
    {
        nombre: "Matemática Discreta",
        ejemplo: `mindmap
    root((Matemática Discreta))
      ::icon(fa fa-network-wired)
        Combinatoria
          Principios de conteo
          Permutaciones
          Combinaciones
          Particiones
        Teoría de Grafos
          Grafos y digrafos
          Caminos y ciclos
          Árboles
          Coloración
        Teoría de Números
          Aritmética modular
          Criptografía
          Algoritmos numéricos
          Teoría de códigos
        Lógica Matemática
          Cálculo proposicional
          Cálculo de predicados
          Teoría de modelos
          Teoría de la demostración
        Optimización Discreta
          Programación lineal
          Programación entera
          Algoritmos voraces
          Metaheurísticas`
    }],
    timeline: [
    {
        nombre: "Historia de las Matemáticas Antiguas",
        ejemplo: `timeline
    title Historia de las Matemáticas Antiguas
    
    section Mesopotamia (2000-500 a.C.)
      ~2000 a.C. : Sistema sexagesimal<br>Tablas de multiplicar
      ~1800 a.C. : Plimpton 322<br>Tripletas pitagóricas
      ~1600 a.C. : Tablilla YBC 7289<br>√2 aproximado
    
    section Antiguo Egipto
      ~1850 a.C. : Papiro de Moscú<br>Volumen de pirámide
      ~1650 a.C. : Papiro de Rhind<br>Problemas algebraicos
      ~300 a.C. : Biblioteca de Alejandría<br>Euclides
    
    section Grecia Clásica
      ~300 a.C. : Elementos de Euclides<br>Geometría axiomática
      ~250 a.C. : Arquímedes<br>Pi y áreas curvilíneas
      ~200 a.C. : Apolonio<br>Secciones cónicas
    
    section India y China
      ~400 : Aryabhata<br>Sistema decimal
      ~600 : Brahmagupta<br>Cero y números negativos
      ~1100 : Bhaskara II<br>Álgebra avanzada`
    },
    {
        nombre: "Desarrollo del Cálculo",
        ejemplo: `timeline
    title Desarrollo del Cálculo Diferencial e Integral
    
    section Precursores (1600-1650)
      1609 : Kepler<br>Leyes del movimiento planetario
      1637 : Descartes<br>Geometría analítica
      1650 : Fermat<br>Método de máximos y mínimos
    
    section Fundadores (1660-1700)
      1666 : Newton<br>Cálculo de fluxiones
      1684 : Leibniz<br>Notación diferencial
      1696 : L'Hôpital<br>Primer libro de cálculo
    
    section Formalización (1700-1800)
      1748 : Euler<br>Introductio in analysin infinitorum
      1821 : Cauchy<br>Definición formal de límite
      1872 : Weierstrass<br>Aritmetización del análisis`
    },
    {
        nombre: "Historia de la Teoría de Números",
        ejemplo: `timeline
    title Evolución de la Teoría de Números
    
    section Antigüedad
      ~300 a.C. : Euclides<br>Infinitud de primos
      ~250 : Diofanto<br>Aritmética diofántica
    
    section Edad Moderna
      1600 : Fermat<br>Último teorema de Fermat
      1801 : Gauss<br>Disquisitiones Arithmeticae
      1859 : Riemann<br>Hipótesis de Riemann
    
    section Siglo XX
      1931 : Gödel<br>Teoremas de incompletitud
      1994 : Wiles<br>Demostración último teorema Fermat
      2000 : Clay Institute<br>Problemas del milenio`
    },
    {
        nombre: "Desarrollo del Álgebra",
        ejemplo: `timeline
    title Evolución del Álgebra
    
    section Orígenes
      ~800 : Al-Juarismi<br>Al-jabr wa'l-muqabala
      ~1100 : Omar Khayyam<br>Geometría algebraica
    
    section Álgebra Moderna
      1545 : Cardano<br>Fórmula ecuación cúbica
      1830 : Galois<br>Teoría de grupos
      1870 : Cayley<br>Teoría de matrices
    
    section Álgebra Abstracta
      1920 : Noether<br>Álgebra homológica
      1930 : Van der Waerden<br>Álgebra moderna
      1960 : Grothendieck<br>Geometría algebraica`
    },
    {
        nombre: "Historia de la Geometría",
        ejemplo: `timeline
    title Desarrollo de la Geometría
    
    section Geometría Clásica
      ~300 a.C. : Euclides<br>Elementos
      ~200 a.C. : Arquímedes<br>Área de la esfera
      ~250 : Diofanto<br>Coordenadas
    
    section Geometría Moderna
      1637 : Descartes<br>Geometría analítica
      1829 : Lobachevsky<br>Geometría no euclidiana
      1854 : Riemann<br>Geometría diferencial
    
    section Siglo XX
      1915 : Einstein<br>Relatividad general
      1950 : Chern<br>Geometría diferencial global
      1980 : Thurston<br>Geometrización 3-variedades`
    },
    {
        nombre: "Matemáticas del Siglo XX",
        ejemplo: `timeline
    title Matemáticas del Siglo XX
    
    section Fundamentos
      1900 : Hilbert<br>23 problemas
      1931 : Gödel<br>Incompletitud
      1963 : Cohen<br>Independencia hipótesis del continuo
    
    section Nuevas Áreas
      1944 : Von Neumann<br>Teoría de juegos
      1948 : Shannon<br>Teoría de la información
      1975 : Mandelbrot<br>Fractales
    
    section Avances Computacionales
      1976 : Appel-Haken<br>Teorema 4 colores
      1998 : Thomas Hales<br>Conjetura de Kepler
      2000 : Clay Institute<br>Problemas del milenio`
    },
    {
        nombre: "Historia de la Probabilidad",
        ejemplo: `timeline
    title Desarrollo de la Teoría de la Probabilidad
    
    section Orígenes
      1654 : Pascal-Fermat<br>Problema de puntos
      1713 : Bernoulli<br>Ley de los grandes números
      1733 : De Moivre<br>Teorema del límite central
    
    section Formalización
      1812 : Laplace<br>Teoría analítica de probabilidad
      1933 : Kolmogorov<br>Axiomatización moderna
      1950 : Shannon<br>Teoría de la información
    
    section Aplicaciones Modernas
      1970 : Black-Scholes<br>Modelo opciones financieras
      1990 : Métodos MCMC<br>Inferencia bayesiana
      2010 : Aprendizaje automático<br>Redes neuronales`
    },
    {
        nombre: "Desarrollo del Análisis",
        ejemplo: `timeline
    title Evolución del Análisis Matemático
    
    section Cálculo Inicial
      1687 : Newton<br>Principia Mathematica
      1748 : Euler<br>Funciones y series
      1821 : Cauchy<br>Rigor en análisis
    
    section Análisis Real
      1872 : Weierstrass<br>Función continua no diferenciable
      1902 : Lebesgue<br>Integral de Lebesgue
      1920 : Banach<br>Espacios de Banach
    
    section Análisis Funcional
      1932 : Von Neumann<br>Espacios de Hilbert
      1950 : Schwartz<br>Teoría de distribuciones
      1970 : Atiyah-Singer<br>Teorema del índice`
    },
    {
        nombre: "Matemáticas Aplicadas",
        ejemplo: `timeline
    title Historia de las Matemáticas Aplicadas
    
    section Física Matemática
      1687 : Newton<br>Leyes del movimiento
      1788 : Lagrange<br>Mecánica analítica
      1925 : Schrödinger<br>Ecuación de onda cuántica
    
    section Ingeniería
      1822 : Fourier<br>Series de Fourier
      1940 : Wiener<br>Cibernética
      1960 : Kalman<br>Filtro de Kalman
    
    section Computación
      1936 : Turing<br>Máquina de Turing
      1945 : Von Neumann<br>Arquitectura computadora
      1971 : Cook<br>NP-completitud`
    },
    {
        nombre: "Mujeres en Matemáticas",
        ejemplo: `timeline
    title Contribuciones de Mujeres en Matemáticas
    
    section Pioneras
      1700 : María Gaetana Agnesi<br>Curva de Agnesi
      1750 : Émilie du Châtelet<br>Traducción Principia
      1800 : Sophie Germain<br>Teoría de números
    
    section Siglo XIX-XX
      1880 : Sofia Kovalevskaya<br>Ecuaciones diferenciales
      1918 : Emmy Noether<br>Álgebra abstracta
      1950 : Katherine Johnson<br>Programa espacial NASA
    
    section Contemporáneas
      1970 : Maryam Mirzakhani<br>Geometría superficies
      1980 : Ingrid Daubechies<br>Wavelets
      2000 : Karen Uhlenbeck<br>Geometría diferencial`
    }],
};

function poblarDiagramasMermaid() {
    Object.keys(diagramasMermaid).forEach(categoria => {
        const contenedor = document.getElementById(`diagramas-${categoria}`);
        if (!contenedor) return;
        
        contenedor.innerHTML = '';
        
        diagramasMermaid[categoria].forEach(diagrama => {
            const boton = document.createElement('button');
            boton.className = 'funcion';
            boton.dataset.ejemplo = diagrama.ejemplo;
            boton.title = diagrama.nombre;
            const nombre = document.createElement('div');
            nombre.className = 'nombre-funcion';
            nombre.textContent = diagrama.nombre;
            boton.appendChild(nombre);
            boton.addEventListener('click', () => {
                insertarTexto('\n```mermaid\n' + diagrama.ejemplo + '\n```\n');
                document.getElementById('panel-mermaid').classList.remove('visible');
            });
            
            contenedor.appendChild(boton);
        });
    });
}

function togglePanelMermaid() {
    const panelMermaid = document.getElementById('panel-mermaid');
    const panelMatematicas = document.getElementById('panel-matematicas');
    
    if (panelMatematicas.classList.contains('visible')) {
        panelMatematicas.classList.remove('visible');
    }
    
    panelMermaid.classList.toggle('visible');
    
    if (panelMermaid.classList.contains('visible')) {
        poblarDiagramasMermaid();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#panel-mermaid .categoria').forEach(boton => {
        boton.addEventListener('click', () => {
            document.querySelectorAll('#panel-mermaid .categoria').forEach(c => c.classList.remove('activa'));
            boton.classList.add('activa');
            const categoria = boton.dataset.categoria;
            document.querySelectorAll('#panel-mermaid .funciones-grid').forEach(grid => {
                grid.style.display = 'none';
            });
            document.getElementById(`diagramas-${categoria}`).style.display = 'grid';
        });
    });

    document.addEventListener('click', (e) => {
        const panelMermaid = document.getElementById('panel-mermaid');
        const btnMermaid = document.getElementById('btn-mermaid');
        
        if (panelMermaid.classList.contains('visible') && 
            !panelMermaid.contains(e.target) && 
            !btnMermaid.contains(e.target)) {
            panelMermaid.classList.remove('visible');
        }
    });
});