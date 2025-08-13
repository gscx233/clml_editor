document.addEventListener('DOMContentLoaded', () => {
    const CLML_NAMESPACE = "http://www.legislation.gov.uk/namespaces/legislation";
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
            originalXmlDoc = newXmlDoc;
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
                originalXmlDoc = newXmlDoc;
            }
            isUpdating = false;
        }
    });

    function updateQuillFromXml(xmlDoc) {
        const primaryNode = xmlDoc.getElementsByTagNameNS(CLML_NAMESPACE, 'Primary')[0];
        if (primaryNode) {
            const html = clmlNodeToHtml(primaryNode);
            quill.root.innerHTML = html;
        } else {
            quill.root.innerHTML = "<p>Error: Could not find &lt;Primary&gt; element. This might be due to a namespace issue.</p>";
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

    const childrenHtml = Array.from(node.childNodes).map(clmlNodeToHtml).join('');

    // A list of tags that should be represented as block-level elements in HTML
    const blockElements = [
        'Primary', 'PrimaryPrelims', 'Body', 'Pblock', 'P1group', 'P1', 'P2',
        'P3', 'P4', 'P1para', 'P2para', 'P3para', 'P4para', 'Para', 'Title',
        'LongTitle', 'UnorderedList', 'ListItem', 'ScheduleBody', 'Part', 'Text'
    ];
    const isBlock = blockElements.includes(node.localName);
    const htmlTag = isBlock ? 'div' : 'span';

    // Store original tag name and attributes in data-* attributes
    let dataAttrs = `data-clml-tag="${node.localName}"`;
    for (const attr of node.attributes) {
        if (!attr.name.startsWith('xmlns')) {
            dataAttrs += ` data-clml-attr-${attr.name}="${attr.value}"`;
        }
    }

    // Add a class for styling based on the original tag
    const className = `clml-${node.localName.toLowerCase()}`;

    return `<${htmlTag} class="${className}" ${dataAttrs}>${childrenHtml}</${htmlTag}>`;
}

function htmlToClml(htmlString, baseXmlDoc) {
    const CLML_NAMESPACE = "http://www.legislation.gov.uk/namespaces/legislation";
    const newXmlDoc = baseXmlDoc.cloneNode(true);
    const primaryNode = newXmlDoc.getElementsByTagNameNS(CLML_NAMESPACE, 'Primary')[0];

    if (!primaryNode) return newXmlDoc;

    while (primaryNode.firstChild) {
        primaryNode.removeChild(primaryNode.firstChild);
    }

    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlString;

    function traverse(htmlNode, clmlParent) {
        Array.from(htmlNode.childNodes).forEach(child => {
            if (child.nodeType === Node.TEXT_NODE) {
                if (child.textContent.trim()) {
                    clmlParent.appendChild(newXmlDoc.createTextNode(child.textContent));
                }
                return;
            }

            if (child.nodeType !== Node.ELEMENT_NODE) return;

            const clmlTagName = child.dataset.clmlTag;
            if (!clmlTagName) {
                // This is likely an element added by Quill for formatting (e.g., <p> for a new line).
                // We will traverse its children to not lose any text.
                traverse(child, clmlParent);
                return;
            }

            const newClmlNode = newXmlDoc.createElementNS(CLML_NAMESPACE, clmlTagName);

            // Reconstruct attributes from data-clml-attr-*
            for (const attr of child.attributes) {
                if (attr.name.startsWith('data-clml-attr-')) {
                    const originalAttrName = attr.name.substring('data-clml-attr-'.length);
                    newClmlNode.setAttribute(originalAttrName, attr.value);
                }
            }

            clmlParent.appendChild(newClmlNode);
            traverse(child, newClmlNode);
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
