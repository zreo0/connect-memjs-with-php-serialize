// Yet another PHP-like serialize & unserialize & serializeSession & unserializeSession
// Version 2021-04-09
// (c) Vitaliy Filippov, 2021+

exports.unserialize = unserialize;
exports.unserializeSession = unserializeSession;
exports.serialize = serialize;
exports.serializeSession = serializeSession;

const bareProto = {}.__proto__;

/**
 * Serialize data in PHP's serialize() format
 *
 * @param any data
 * @param object typeNames
 * @return serialized data
 */
function serialize(data, typeNames)
{
    if (typeof data === 'number')
    {
        if (data === (data|0))
            return 'i:'+data+';';
        else if (isNaN(data))
            return 'd:NAN;';
        else if (data == Infinity)
            return 'd:INF;';
        else if (data == -Infinity)
            return 'd:-INF;';
        else
            return 'd:'+data+';';
    }
    else if (typeof data === 'boolean')
    {
        return 'b:'+(data ? 1 : 0)+';';
    }
    else if (data == null) // or undefined
    {
        return 'N;';
    }
    else if (typeof data === 'string')
    {
        return 's:'+utf8length(data)+':"'+data+'";';
    }
    else if (data instanceof Array)
    {
        let s = 'a:'+data.length+':{';
        data.forEach((d, i) => s += serialize(i, typeNames)+serialize(d, typeNames));
        s += '}';
        return s;
    }
    else if (data instanceof Object)
    {
        const keys = Object.keys(data);
        let s;
        if (data.__proto__ !== bareProto)
        {
            const type = typeNames && typeNames[data.__proto__.name] || data.__proto__.name;
            s = 'o:'+utf8length(type)+'"'+type+'":';
        }
        else
        {
            s = 'a:';
        }
        s += keys.length+':{';
        keys.forEach(k => s += serialize(k, typeNames)+serialize(data[k], typeNames));
        s += '}';
        return s;
    }
    // Unsupported type
    throw new Error('Attempt to serialize an unsupported type');
}

/**
 * Serialize data in PHP's session format (like session_encode())
 *
 * @param object data
 * @return serialized session
 */
function serializeSession(data)
{
    return Object.keys(data).filter(k => k.indexOf('|') < 0).map(k => k+'|'+serialize(data[k])).join('');
}

/**
 * Unserialize data taken from PHP's serialize() output
 *
 * @param string serialized data
 * @return unserialized data
 * @throws
 */
function unserialize(data)
{
    const u = new Unserializer();
    return u.unserialize(data);
}

/**
 * Parse PHP-serialized session data
 *
 * @param string serialized session
 * @return unserialized data
 * @throws
 */
function unserializeSession(data)
{
    const u = new Unserializer();
    u.data = data;
    u.offset = 0;
    const res = {};
    while (u.offset < data.length)
    {
        const pos = data.indexOf('|', u.offset);
        if (pos < 0)
            break;
        const key = data.substr(u.offset, pos-u.offset);
        u.offset = pos+1;
        res[key] = u.unserializeAt();
    }
    return res;
}

function utf8charSize(code)
{
    if (code < 0x0080)
        return 1;
    if (code < 0x0800)
        return 2;
    if (code < 0x10000)
        return 3;
    return 4;
}

function utf8length(str)
{
    let l = 0;
    for (let i = 0; i < str.length; i++)
        l += utf8charSize(str.charCodeAt(i));
    return l;
}

class Unserializer
{
    readUntil(stopchr)
    {
        let pos = this.data.indexOf(stopchr, this.offset);
        if (pos < 0)
            throw new Error(stopchr+' expected after '+this.offset);
        let res = this.data.substr(this.offset, pos-this.offset);
        this.offset = pos+1;
        return res;
    }

    readChars(length)
    {
        let pos = this.offset;
        while (length > 0)
        {
            length -= utf8charSize(this.data.charCodeAt(pos));
            pos++;
        }
        let res = this.data.substr(this.offset, pos-this.offset);
        this.offset = pos;
        return res;
    }

    readStr()
    {
        const bytelength = this.readUntil(':');
        this.offset++; // "
        const str = this.readChars(parseInt(bytelength, 10));
        this.offset += 2; // ";
        return str;
    }

    unserialize(data)
    {
        this.data = data;
        this.offset = 0;
        return this.unserializeAt();
    }

    unserializeAt()
    {
        if (this.offset >= this.data.length)
            throw new Error('Expected type at '+this.offset);
        const type = this.data[this.offset].toLowerCase();
        this.offset += 2; // t:
        let result, arraylength, typename;
        switch (type)
        {
        case 'i':
            return parseInt(this.readUntil(';'), 10);
        case 'b':
            return this.readUntil(';') !== '0';
        case 'd':
            return parseFloat(this.readUntil(';'));
        case 'n':
            return null;
        case 's':
            return this.readStr();
        case 'a':
            result = [ {}, [], true ];
            arraylength = parseInt(this.readUntil(':'));
            this.offset++;
            for (let i = 0; i < arraylength; i++)
            {
                const key = this.unserializeAt();
                const value = this.unserializeAt();
                if (key != i)
                    result[2] = false;
                if (result[2])
                    result[1][i] = value;
                result[0][key] = value;
            }
            this.offset++;
            return result[2] ? result[1] : result[0];
        case 'o':
            result = {};
            typename = this.readStr();
            arraylength = parseInt(this.readUntil(':'));
            this.offset++;
            for (let i = 0; i < arraylength; i++)
            {
                let key = this.unserializeAt();
                const value = this.unserializeAt();
                key = key.replace('\u0000*\u0000', '');
                result[key] = value;
            }
            this.offset++;
            return { [typename]: result };
        default:
            throw new Error('Unknown / Unhandled data type(s): ' + type);
        }
    }
}
