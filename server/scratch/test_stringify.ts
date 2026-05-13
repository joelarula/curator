const proxy = new Proxy({}, {
    get(target, prop) {
        if (prop === 'toJSON') return () => "{{proxy}}";
        return undefined;
    }
});

const args = {
    uri: proxy,
    fn: (data: any) => true
};

const str = JSON.stringify(args, (key, value) => {
    if (typeof value === 'function') return value.toString();
    return value;
});

console.log(str);
console.log(JSON.parse(str));
