# ADR-0003 — Primary key: UUIDv7

**Status:** Diterima

## Keputusan

UUIDv7 (RFC 9562) menaruh timestamp Unix milidetik di 48 bit pertama sehingga ID urut
waktu dan ramah index — insert tidak menyebar acak seperti UUIDv4. Tipe `uuid` native
Postgres = 16 byte.

ULID juga time-sortable, tetapi di-encode Crockford base32 menjadi 26 karakter: bukan
tipe native, disimpan sebagai char(26) = 26 byte. Keunggulannya hanya ID bisa dibaca
manusia — bukan kebutuhan template ini.

**Konsekuensi:** ID dihasilkan database lewat `uuidv7()`, bukan aplikasi.

**Alternatif ditolak:** ULID, UUIDv4, bigserial.
