import { createElement, type PropsWithChildren, type ReactNode } from 'react';

const element = (tag: 'svg' | 'circle' | 'path') =>
  function SvgElement({
    children,
    ...props
  }: PropsWithChildren<Record<string, unknown>>): ReactNode {
    return createElement(tag, props, children);
  };

export const Svg = element('svg');
export const Circle = element('circle');
export const Path = element('path');
export default Svg;
