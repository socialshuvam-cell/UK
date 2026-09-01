<?php
namespace App\Core;

final class Validator
{
    private array $data;
    private array $errors = [];

    public function __construct(array $data)
    {
        $this->data = $data;
    }

    public function required(string $field, ?string $label = null): self
    {
        $label ??= $field;
        if (!isset($this->data[$field]) || trim((string) $this->data[$field]) === '') {
            $this->errors[$field][] = "{$label} is required";
        }
        return $this;
    }

    public function maxLength(string $field, int $max): self
    {
        if (isset($this->data[$field]) && mb_strlen((string) $this->data[$field]) > $max) {
            $this->errors[$field][] = "{$field} must be at most {$max} characters";
        }
        return $this;
    }

    public function in(string $field, array $allowed): self
    {
        if (isset($this->data[$field]) && $this->data[$field] !== '' && !in_array($this->data[$field], $allowed, true)) {
            $this->errors[$field][] = "{$field} must be one of: " . implode(', ', $allowed);
        }
        return $this;
    }

    public function integer(string $field): self
    {
        if (isset($this->data[$field]) && $this->data[$field] !== '' && filter_var($this->data[$field], FILTER_VALIDATE_INT) === false) {
            $this->errors[$field][] = "{$field} must be an integer";
        }
        return $this;
    }

    public function fails(): bool
    {
        return count($this->errors) > 0;
    }

    public function errors(): array
    {
        return $this->errors;
    }
}
