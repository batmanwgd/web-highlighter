import HighlightRange from '../model/range';
import {SplitType, SelectedNode, DomNode, SelectedNodeType} from '../types';
import {isHighlightWrapNode} from '../util/dom';
import {
    WRAP_TAG,
    ID_DIVISION,
    DEFAULT_OPTIONS,
    CAMEL_DATASET_IDENTIFIER,
    CAMEL_DATASET_IDENTIFIER_EXTRA,
    DATASET_IDENTIFIER,
    DATASET_SPLIT_TYPE,
    DATASET_IDENTIFIER_EXTRA
} from '../util/const';

/**
 * 支持的选择器类型
 *  - class: .title, .main-nav
 *  - id: #nav, #js-toggle-btn
 *  - tag: div, p, span
 */
const isMatchSelector = ($node: HTMLElement, selector: string): boolean => {
    if (!$node) {
        return false;
    }
    if (/^\./.test(selector)) {
        const className = selector.replace(/^\./, '');
        return $node && $node.classList.contains(className);
    }
    else if (/^#/.test(selector)) {
        const id = selector.replace(/^#/, '');
        return $node && $node.id === id;
    }
    else {
        const tagName = selector.toUpperCase()
        return $node && $node.tagName === tagName;
    }
}

/**
 * get all the dom nodes between the start and end node
 */
export const getSelectedNodes = (
    $root: HTMLElement | Document,
    start: DomNode,
    end: DomNode,
    exceptSelectors: Array<string>
): SelectedNode[] => {
    const $startNode = start.$node;
    const $endNode = end.$node;
    const startOffset = start.offset;
    const endOffset = end.offset;

    // split current node when the start-node and end-node is the same
    if ($startNode === $endNode && $startNode instanceof Text) {

        let $element = $startNode as Node;
        while ($element) {
            if ($element.nodeType === 1
                && exceptSelectors
                && exceptSelectors.some(s => isMatchSelector($element as HTMLElement, s))
            ) {
                return [];
            }
            $element = $element.parentNode;
        }

        $startNode.splitText(startOffset);
        let passedNode = $startNode.nextSibling as Text;
        passedNode.splitText(endOffset - startOffset);
        return [{
            $node: passedNode,
            type: SelectedNodeType.text,
            splitType: SplitType.both
        }];
    }

    const nodeStack: Array<HTMLElement | Document | ChildNode | Text> = [$root];
    const selectedNodes: SelectedNode[] = [];

    let withinSelectedRange = false;
    let curNode: Node = null;
    while (curNode = nodeStack.pop()) {
        // do not traverse the excepted node
        if (
            curNode.nodeType === 1
            && exceptSelectors
            && exceptSelectors.some(s => isMatchSelector(curNode as HTMLElement, s))
        ) {
            continue;
        }

        const children = curNode.childNodes;
        for (let i = children.length - 1; i >= 0; i--) {
            nodeStack.push(children[i]);
        }

        // only collect text nodes
        if (curNode === $startNode) {
            if (curNode.nodeType === 3) {
                (curNode as Text).splitText(startOffset);
                const node = curNode.nextSibling as Text;
                selectedNodes.push({
                    $node: node,
                    type: SelectedNodeType.text,
                    splitType: SplitType.head
                });

            }
            // meet the start-node (begin to traverse)
            withinSelectedRange = true;
        }
        else if (curNode === $endNode) {
            if (curNode.nodeType === 3) {
                const node = (curNode as Text);
                node.splitText(endOffset);
                selectedNodes.push({
                    $node: node,
                    type: SelectedNodeType.text,
                    splitType: SplitType.tail
                });
            }
            // meet the end-node
            break;
        }
        // handle text nodes between the range
        else if (withinSelectedRange && curNode.nodeType === 3) {
            selectedNodes.push({
                $node: curNode as Text,
                type: SelectedNodeType.text,
                splitType: SplitType.none
            });
        }
    }
    return selectedNodes;
};

function addClass($el: HTMLElement, className?: string | Array<string>): HTMLElement  {
    let classNames = Array.isArray(className) ? className : [className];
    classNames = classNames.length === 0 ? [DEFAULT_OPTIONS.style.className] : classNames;
    classNames.forEach(c => $el.classList.add(c));
    return $el;
}

/**
 * wrap a dom node with highlight wrapper
 * 
 * Because of supporting the highlight-overlapping,
 * Highlighter can't just wrap all nodes in a simple way.
 * There are three types:
 *  - wrapping a whole new node (without any wrapper)
 *  - wrapping part of the node
 *  - wrapping the whole wrapped node
 */
export const wrapHighlight = (
    selected: SelectedNode,
    range: HighlightRange,
    className?: string | Array<string>
): HTMLElement => {
    const $parent = selected.$node.parentNode as HTMLElement;
    const $prev = selected.$node.previousSibling;
    const $next = selected.$node.nextSibling;

    let $wrap: HTMLElement;
    // text node, not in a highlight wrapper -> should be wrapped in a highlight wrapper
    if (!isHighlightWrapNode($parent)) {
        $wrap = document.createElement(WRAP_TAG);
        addClass($wrap, className);

        $wrap.appendChild(selected.$node.cloneNode(false));
        selected.$node.parentNode.replaceChild($wrap, selected.$node);

        $wrap.setAttribute(`data-${DATASET_IDENTIFIER}`, range.id);
        $wrap.setAttribute(`data-${DATASET_SPLIT_TYPE}`, selected.splitType);
        $wrap.setAttribute(`data-${DATASET_IDENTIFIER_EXTRA}`, '');
    }
    // text node, in a highlight wrap -> should split the existing highlight wrapper
    else if (isHighlightWrapNode($parent) && ($prev || $next)) {
        const $fr = document.createDocumentFragment();
        const parentId = $parent.dataset[CAMEL_DATASET_IDENTIFIER];
        const parentExtraId = $parent.dataset[CAMEL_DATASET_IDENTIFIER_EXTRA];
        $wrap = document.createElement(WRAP_TAG);

        const extraInfo = parentExtraId ? parentId + ID_DIVISION + parentExtraId : parentId;
        $wrap.setAttribute(`data-${DATASET_IDENTIFIER}`, range.id);
        $wrap.setAttribute(`data-${DATASET_IDENTIFIER_EXTRA}`, extraInfo);
        $wrap.appendChild(selected.$node.cloneNode(false));

        let headSplit = false;
        let tailSplit = false;
        let splitType: SplitType;

        if ($prev) {
            const $span = $parent.cloneNode(false);
            $span.textContent = $prev.textContent;
            $fr.appendChild($span);
            headSplit = true;
        }

        addClass($wrap, className);
        $fr.appendChild($wrap);

        if ($next) {
            const $span = $parent.cloneNode(false);
            $span.textContent = $next.textContent;
            $fr.appendChild($span);
            tailSplit = true;
        }

        if (headSplit && tailSplit) {
            splitType = SplitType.both;
        }
        else if (headSplit) {
            splitType = SplitType.head;
        }
        else if (tailSplit) {
            splitType = SplitType.tail;
        }
        else {
            splitType = SplitType.none;
        }

        $wrap.setAttribute(`data-${DATASET_SPLIT_TYPE}`, splitType);
        $parent.parentNode.replaceChild($fr, $parent);
    }
    // completely overlap (with a highlight wrap) -> only add extra id info
    else {
        $wrap = $parent;
        addClass($wrap, className);
        const dataset = $parent.dataset;
        const formerId = dataset[CAMEL_DATASET_IDENTIFIER];
        dataset[CAMEL_DATASET_IDENTIFIER] = range.id;
        dataset[CAMEL_DATASET_IDENTIFIER_EXTRA] = dataset[CAMEL_DATASET_IDENTIFIER_EXTRA]
            ? formerId + ID_DIVISION + dataset[CAMEL_DATASET_IDENTIFIER_EXTRA]
            : formerId;
    }
    return $wrap;
};

/**
 * merge the adjacent text nodes
 * .normalize() API has some bugs in IE11
 */
export const normalizeSiblingText = ($s: Node, isNext: boolean = true) => {
    if (!$s || $s.nodeType !== 3) {
        return;
    }
    const $sibling = isNext ? $s.nextSibling : $s.previousSibling;
    if ($sibling.nodeType !== 3) {
        return;
    }
    const text = $sibling.nodeValue;
    $s.nodeValue = isNext ? ($s.nodeValue + text) : (text + $s.nodeValue);
    $sibling.parentNode.removeChild($sibling);
}