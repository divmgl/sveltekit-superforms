import { parse, stringify } from 'devalue';
export function clone(data) {
    return parse(stringify(data));
}
