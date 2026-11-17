import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Input, Select, Textarea } from './Input';
import { FormField } from '../FormField';

describe('field primitives', () => {
  it('draw the form look by default and the inline look on request', () => {
    render(<>
      <Input aria-label="a" />
      <Input aria-label="b" look="inline" className="extra" />
      <Select aria-label="c"><option>x</option></Select>
      <Select aria-label="d" look="inline"><option>x</option></Select>
      <Textarea aria-label="e" />
      <Textarea aria-label="f" look="inline" />
    </>);
    expect(screen.getByLabelText('a').className).toBe('cm-input');
    expect(screen.getByLabelText('b').className).toBe('as-input extra');
    expect(screen.getByLabelText('c').className).toBe('cm-select');
    expect(screen.getByLabelText('d').className).toBe('as-select');
    expect(screen.getByLabelText('e').className).toBe('cm-textarea');
    expect(screen.getByLabelText('f').className).toBe('as-input');
  });

  it('pass props and refs through to the element', () => {
    let el: HTMLInputElement | null = null;
    render(<Input ref={r => { el = r; }} type="number" defaultValue={3} aria-label="n" />);
    expect(el).toBe(screen.getByLabelText('n'));
    expect((el as unknown as HTMLInputElement).type).toBe('number');
  });
});

describe('FormField', () => {
  it('labels the control inside it: the label points at the field', () => {
    render(<FormField label="Name"><Input /></FormField>);
    const field = screen.getByLabelText('Name');
    expect(field.tagName).toBe('INPUT');
    const label = screen.getByText('Name').closest('label') as HTMLLabelElement;
    expect(label.control).toBe(field);
  });

  it('gives each field its own id', () => {
    render(<>
      <FormField label="One"><Input /></FormField>
      <FormField label="Two"><Select><option>x</option></Select></FormField>
      <FormField label="Three"><Textarea /></FormField>
    </>);
    const ids = ['One', 'Two', 'Three'].map(l => screen.getByLabelText(l).id);
    expect(new Set(ids).size).toBe(3);
    ids.forEach(id => expect(id).toBeTruthy());
  });

  it('points at a control with its own id when given htmlFor', () => {
    render(<>
      <FormField label="Raw" htmlFor="raw"><input id="raw" /></FormField>
      <FormField label="Own id" htmlFor="mine"><Input id="mine" /></FormField>
    </>);
    expect(screen.getByLabelText('Raw').id).toBe('raw');
    expect(screen.getByLabelText('Own id').id).toBe('mine');
  });
});
