import { createContext, useContext } from 'react';

// <FormField> provides the id its <label htmlFor> points at; the <Input>,
// <Select> or <Textarea> inside takes it as its own id unless given one.
// Clicking the label then focuses the control, and screen readers announce it.
// The label's own id is `${id}-label`, for controls named by aria-labelledby
// (SlashField's contentEditable editor).
export const FieldIdContext = createContext<string | undefined>(undefined);

export const useFieldId = () => useContext(FieldIdContext);
