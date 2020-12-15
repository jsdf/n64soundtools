import React from 'react';

export default function SelectWithLabel({
  label,
  options,
  value,
  onChange,
  onFocus,
}) {
  return (
    <label>
      {label}:{' '}
      <select
        value={value}
        onChange={React.useCallback(
          (event) => onChange(event.currentTarget.value),
          [onChange]
        )}
        onFocus={onFocus}
      >
        {options.map(({value, label}) => {
          return (
            <option key={value} value={value}>
              {label}
            </option>
          );
        })}
      </select>
    </label>
  );
}
