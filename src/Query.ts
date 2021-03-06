import { parse, stringify } from 'date-aware-json';

export type PrimitiveValue = boolean | number | string;
export type OrderedPrimitiveValue = number | string;

export interface EqualitySelector {
  type: 'equalTo' | 'notEqualTo';
  key: string;
  value: PrimitiveValue;
}

export interface ComparisonSelector {
  type: 'lessThan' | 'lessThanOrEqual' | 'greaterThan' | 'greaterThanOrEqual';
  key: string;
  value: OrderedPrimitiveValue;
}

export interface ContainmentSelector {
  type: 'containedIn' | 'notContainedIn';
  key: string;
  value: PrimitiveValue[];
}

export interface ModSelector {
  type: 'mod';
  key: string;
  divisor: number;
  remainder: number;
}

export interface RegexSelector {
  type: 'regex';
  key: string;
  regex: string;
  options: string;
}

export interface WhereSelector {
  type: 'where';
  expressionString: string;
}

export type Selector = EqualitySelector | ComparisonSelector | ContainmentSelector | ModSelector | RegexSelector | WhereSelector;

export interface SortOperator {
  type: 'ascending' | 'descending';
  key: string
}


export class Query {
  private className_: string;
  private selectors_: Selector[];
  private sortOperators_: SortOperator[];
  private limit_?: number | null;
  private skip_?: number | null;
  

  constructor(className: string) {
    this.className_ = className;
    this.selectors_ = [];
    this.sortOperators_ = [];
    this.limit_ = null;
    this.skip_ = null;
  }

  serialize(): any {
    return {
      className: this.className,
      selectors: this.selectors,
      sortOperators: this.sortOperators,
      limit: this.limit,
      skip: this.skip,
    };
  }

  static deserialize(data: any): Query {
    const {
      className,
      selectors,
      sortOperators,
      limit,
      skip,
    } = data;

    const query = new Query(className);
    query.selectors_ = selectors;
    query.sortOperators_ = sortOperators;
    query.limit_ = limit;
    query.skip_ = skip;

    return query;
  }


  get className(): string {
    return this.className_;
  }


  equalTo(key: string, value: PrimitiveValue) {
    this.selectors_.push({ type: 'equalTo', key, value });
  }

  notEqualTo(key: string, value: PrimitiveValue) {
    this.selectors_.push({ type: 'notEqualTo', key, value });
  }

  lessThan(key: string, value: OrderedPrimitiveValue) {
    this.selectors_.push({ type: 'lessThan', key, value });
  }

  lessThanOrEqual(key: string, value: OrderedPrimitiveValue) {
    this.selectors_.push({ type: 'lessThanOrEqual', key, value });
  }

  greaterThan(key: string, value: OrderedPrimitiveValue) {
    this.selectors_.push({ type: 'greaterThan', key, value });
  }

  greaterThanOrEqual(key: string, value: OrderedPrimitiveValue) {
    this.selectors_.push({ type: 'greaterThanOrEqual', key, value });
  }

  containedIn(key: string, value: Array<PrimitiveValue>) {
    this.selectors_.push({ type: 'containedIn', key, value });
  }

  notContainedIn(key: string, value: Array<PrimitiveValue>) {
    this.selectors_.push({ type: 'notContainedIn', key, value });
  }

  mod(key: string, divisor: number, remainder: number) {
    this.selectors_.push({ type: 'mod', key, divisor, remainder });
  }

  regex(key: string, regex: string, options: string) {
    this.selectors_.push({ type: 'regex', key, regex, options });
  }

  where(expressionString: string) {
    this.selectors_.push({ type: 'where', expressionString });
  }

  get selectors(): Selector[] {
    return this.selectors_;
  } 


  ascending(key: string) {
    this.sortOperators_.push({ type: 'ascending', key });
  }

  descending(key: string) {
    this.sortOperators_.push({ type: 'descending', key });
  }

  get sortOperators(): SortOperator[] {
    return this.sortOperators_;
  }


  get limit(): number | null {
    return this.limit_ || null;
  }

  set limit(limit: number | null) {
    this.limit_ = limit;
  }

  get skip(): number | null {
    return this.skip_ || null;
  }

  set skip(skip: number | null) {
    this.skip_ = skip;
  }
}
