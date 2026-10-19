export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Product address on the website: brand + model, but not "nova-nova-x1" when the model name already starts with the brand. */
export function productSlug(brand: string, name: string): string {
  const b = slugify(brand)
  const n = slugify(name)
  return !b || n === b || n.startsWith(`${b}-`) ? n : slugify(`${brand} ${name}`)
}
