interface LRUItem<T> {
  key: string;
  prev: LRUItem<T> | null;
  next: LRUItem<T> | null;
  value: T;
}

class LRU<T> {
  private items: Record<string, LRUItem<T>>;
  private first: LRUItem<T> | null;
  private last: LRUItem<T> | null;
  private max: number;
  private size: number;

  /**
   * Creates a new LRU cache instance.
   */
  constructor(max = 0) {
    this.items = {};
    this.first = null;
    this.last = null;
    this.max = max;
    this.size = 0;
  }

  /**
   * Removes all items from the cache.
   */
  clear() {
    this.items = {};
    this.first = null;
    this.last = null;
    this.size = 0;

    return this;
  }

  /**
   * Removes an item from the cache by key.
   */
  delete(key: string) {
    if (this.has(key)) {
      const item = this.items[key];
      if (!item) {
        return this;
      }

      delete this.items[key];
      --this.size;

      if (item.prev !== null) {
        item.prev.next = item.next;
      }

      if (item.next !== null) {
        item.next.prev = item.prev;
      }

      if (this.first === item) {
        this.first = item.next;
      }

      if (this.last === item) {
        this.last = item.prev;
      }
    }

    return this;
  }

  /**
   * Returns an array of [key, value] pairs for the specified keys.
   */
  entries(keys = this.keys()): [string, T | undefined][] {
    return keys.map((key) => [key, this.get(key)]);
  }

  /**
   * Removes the least recently used item from the cache.
   */
  evict() {
    if (this.size > 0) {
      const item = this.first;
      if (!item) {
        return this;
      }

      delete this.items[item.key];

      --this.size;
      if (this.size === 0) {
        this.first = null;
        this.last = null;
      } else if (item.next) {
        this.first = item.next;
        this.first.prev = null;
      }
    }

    return this;
  }

  /**
   * Retrieves a value from the cache by key. Updates the item's position to most recently used.
   */
  get(key: string) {
    let result: T | undefined = undefined;

    if (this.has(key)) {
      const item = this.items[key];
      if (!item) {
        return undefined;
      }
      result = item.value;
      // update the item to the most recently used
      this.set(key, result);
    }

    return result;
  }

  has(key: string) {
    return key in this.items;
  }

  keys() {
    const result: string[] = [];
    let x = this.first;

    while (x !== null) {
      result.push(x.key);
      x = x.next;
    }

    return result;
  }

  /**
   * Sets a value in the cache. Updates the item's position to most recently used.
   */
  set(key: string, value: T) {
    let item: LRUItem<T> | null = null;

    if (this.has(key)) {
      item = this.items[key] ?? null;
      if (!item) {
        return this;
      }
      item.value = value;

      if (this.last !== item) {
        const last = this.last;
        const next = item.next;
        const prev = item.prev;

        if (this.first === item) {
          this.first = item.next;
        }

        item.next = null;
        item.prev = this.last;
        if (last) {
          last.next = item;
        }

        if (prev !== null) {
          prev.next = next;
        }

        if (next !== null) {
          next.prev = prev;
        }
      }
    } else {
      if (this.max > 0 && this.size === this.max) {
        this.evict();
      }

      item = {
        key: key,
        prev: this.last,
        next: null,
        value,
      };
      this.items[key] = item;
      ++this.size;

      if (this.size === 1) {
        this.first = item;
      } else if (this.last) {
        this.last.next = item;
      }
    }

    this.last = item;

    return this;
  }

  /**
   * Returns an array of all values in the cache for the specified keys.
   */
  values(keys = this.keys()) {
    return keys.map((key) => this.get(key));
  }
}

export function createLRU<T>(max = 1000) {
  return new LRU<T>(max);
}
