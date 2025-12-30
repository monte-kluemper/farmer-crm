export function formatDateTime(value: string | Date | null | undefined) {
    if (!value) return "—";
    const d = typeof value === "string" ? new Date(value) : value;
    return new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(d);
}

export function formatDate(value: string | Date | null | undefined) {
    if (!value) return "—";
    const d = typeof value === "string" ? new Date(value) : value;
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(d);
}

export function formatCurrencyEUR(value: number | null | undefined) {
    if (value == null) return "—";
    return new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
    }).format(value);
}
