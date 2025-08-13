document.addEventListener('DOMContentLoaded', () => {
    let originalXmlDoc;
    let isUpdating = false;

    const quill = new Quill('#quill-editor', {
        theme: 'snow',
        modules: {
            toolbar: [
                [{ 'header': [1, 2, 3, false] }],
                ['bold', 'italic', 'underline'],
                [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                ['link'],
                ['clean']
            ]
        }
    });

    const xmlEditor = document.getElementById('xml-editor');
    const richTextTab = document.getElementById('rich-text-tab');
    const xmlTab = document.getElementById('xml-tab');
    const editorContainer = document.getElementById('editor-container');
    const xmlContainer = document.getElementById('xml-container');

    // Tab switching logic
    richTextTab.addEventListener('click', () => {
        editorContainer.style.display = 'block';
        xmlContainer.style.display = 'none';
        richTextTab.classList.add('active');
        xmlTab.classList.remove('active');
    });

    xmlTab.addEventListener('click', () => {
        editorContainer.style.display = 'none';
        xmlContainer.style.display = 'block';
        xmlTab.classList.add('active');
        richTextTab.classList.remove('active');
    });

    // Fetch and load initial data
    fetch('clml.xml')
        .then(response => response.text())
        .then(str => {
            const parser = new DOMParser();
            originalXmlDoc = parser.parseFromString(str, "application/xml");

            updateQuillFromXml(originalXmlDoc);
            updateXmlEditor(originalXmlDoc);
        })
        .catch(err => {
            console.error('Error fetching or parsing clml.xml:', err);
            quill.root.innerHTML = `<p>Error: ${err.message}</p>`;
        });

    // Two-way binding listeners
    quill.on('text-change', (delta, oldDelta, source) => {
        if (source === 'user' && !isUpdating) {
            isUpdating = true;
            const newXmlDoc = htmlToClml(quill.root.innerHTML, originalXmlDoc);
            updateXmlEditor(newXmlDoc);
            originalXmlDoc = newXmlDoc; // Update the reference
            isUpdating = false;
        }
    });

    xmlEditor.addEventListener('input', () => {
        if (!isUpdating) {
            isUpdating = true;
            const parser = new DOMParser();
            const newXmlDoc = parser.parseFromString(xmlEditor.value, "application/xml");

            const parseError = newXmlDoc.querySelector('parsererror');
            if (parseError) {
                console.error('XML parsing error:', parseError);
            } else {
                updateQuillFromXml(newXmlDoc);
                originalXmlDoc = newXmlDoc; // Update the reference
            }
            isUpdating = false;
        }
    });

    function updateQuillFromXml(xmlDoc) {
        const primaryNode = xmlDoc.getElementsByTagName('Primary')[0];
        if (primaryNode) {
            const html = clmlNodeToHtml(primaryNode);
            quill.root.innerHTML = html;
        } else {
            quill.root.innerHTML = "<p>Error: Could not find &lt;Primary&gt; element.</p>";
        }
    }

    function updateXmlEditor(xmlDoc) {
        const serializer = new XMLSerializer();
        const xmlString = serializer.serializeToString(xmlDoc);
        xmlEditor.value = formatXml(xmlString);
    }
});

function clmlNodeToHtml(node) {
    if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
        return '';
    }

    let childrenHtml = Array.from(node.childNodes).map(clmlNodeToHtml).join('');

    // Basic mapping, can be expanded
    switch (node.nodeName) {
        case 'Title': return `<h2>${childrenHtml}</h2>`;
        case 'LongTitle': return `<h3>${childrenHtml}</h3>`;
        case 'Para':
        case 'Text': return `<p>${childrenHtml}</p>`;
        case 'Emphasis': return `<em>${childrenHtml}</em>`;
        case 'SmallCaps': return `<span style="font-variant: small-caps;">${childrenHtml}</span>`;
        case 'Term': return `<strong>${childrenHtml}</strong>`;
        case 'UnorderedList': return `<ul>${childrenHtml}</ul>`;
        case 'ListItem': return `<li>${childrenHtml}</li>`;
        default: return `<div>${childrenHtml}</div>`; // Default to a div for structure
    }
}

function htmlToClml(htmlString, baseXmlDoc) {
    const newXmlDoc = baseXmlDoc.cloneNode(true);
    const primaryNode = newXmlDoc.getElementsByTagName('Primary')[0];

    if (!primaryNode) return newXmlDoc;

    while (primaryNode.firstChild) {
        primaryNode.removeChild(primaryNode.firstChild);
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString;

    function traverse(htmlNode, clmlParent) {
        htmlNode.childNodes.forEach(child => {
            let newClmlNode;

            if (child.nodeType === Node.TEXT_NODE && child.textContent.trim() !== '') {
                const textWrapper = newXmlDoc.createElement('Text');
                textWrapper.appendChild(newXmlDoc.createTextNode(child.textContent));
                clmlParent.appendChild(textWrapper);
                return;
            }

            if (child.nodeType !== Node.ELEMENT_NODE) return;

            switch (child.nodeName) {
                case 'H2': newClmlNode = newXmlDoc.createElement('Title'); break;
                case 'H3': newClmlNode = newXmlDoc.createElement('LongTitle'); break;
                case 'P': newClmlNode = newXmlDoc.createElement('Para'); break;
                case 'EM': newClmlNode = newXmlDoc.createElement('Emphasis'); break;
                case 'STRONG': newClmlNode = newXmlDoc.createElement('Term'); break;
                case 'UL': newClmlNode = newXmlDoc.createElement('UnorderedList'); break;
                case 'LI': newClmlNode = newXmlDoc.createElement('ListItem'); break;
                default: newClmlNode = newXmlDoc.createElement('P1'); break; // Default to a structural tag
            }

            if (newClmlNode) {
                clmlParent.appendChild(newClmlNode);
                traverse(child, newClmlNode);
            } else {
                traverse(child, clmlParent);
            }
        });
    }

    traverse(tempDiv, primaryNode);
    return newXmlDoc;
}

function formatXml(xml) {
    let formatted = '', indent= '';
    const tab = '  ';
    xml.split(/>\s*</).forEach(node => {
        if (node.match( /^\/\w/ )) indent = indent.substring(tab.length);
        formatted += indent + '<' + node + '>\r\n';
        if (node.match( /^<?\w[^>]*[^\/]$/ )) indent += tab;
    });
    return formatted.substring(1, formatted.length - 3);
}
