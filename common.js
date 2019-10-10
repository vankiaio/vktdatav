const { TextEncoder, TextDecoder } = require('util');
const fetch = require('node-fetch');
const encoder = new TextEncoder('utf8');
const decoder = new TextDecoder('utf8');
const fs = require('fs');

class Ut {
    /**
    * 异步延迟
    * @param {number} time 延迟的时间,单位毫秒
    */
    static sleep(time = 0) {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          resolve();
        }, time);
      })
    };
    /**
    * 字符串是否为空
    * @param {string} value 字符串
    */
    static isEmpty(value) {
      return typeof value == 'string' && !value.trim() || typeof value == 'undefined' || value === null;
    }
}

class SerialBuffer {
    constructor({ array } = {}) {
        this.array = array || new Uint8Array(1024);
        this.length = array ? array.length : 0;
        this.readPos = 0;
    }

    reserve(size) {
        if (this.length + size <= this.array.length) {
            return;
        }
        let l = this.array.length;
        while (this.length + size > l) {
            l = Math.ceil(l * 1.5);
        }
        const newArray = new Uint8Array(l);
        newArray.set(this.array);
        this.array = newArray;
    }

    asUint8Array() {
        return new Uint8Array(this.array.buffer, this.array.byteOffset, this.length);
    }

    pushArray(v) {
        this.reserve(v.length);
        this.array.set(v, this.length);
        this.length += v.length;
    }

    get() {
        if (this.readPos < this.length) {
            return this.array[this.readPos++];
        }
        throw new Error("Read past end of buffer");
    }

    pushVaruint32(v) {
        while (true) {
            if (v >>> 7) {
                this.pushArray([0x80 | (v & 0x7f)]);
                v = v >>> 7;
            } else {
                this.pushArray([v]);
                break;
            }
        }
    }

    getVaruint32() {
        let v = 0;
        let bit = 0;
        while (true) {
            const b = this.get();
            v |= (b & 0x7f) << bit;
            bit += 7;
            if (!(b & 0x80)) {
                break;
            }
        }
        return v >>> 0;
    }

    getUint8Array(len) {
        if (this.readPos + len > this.length)
            throw new Error("Read past end of buffer");
        const result = new Uint8Array(this.array.buffer, this.array.byteOffset + this.readPos, len);
        this.readPos += len;
        return result;
    }

    pushBytes(v) {
        this.pushVaruint32(v.length);
        this.pushArray(v);
    }

    getBytes() {
        return this.getUint8Array(this.getVaruint32());
    }
} // SerialBuffer

class ClientWasm {
    constructor(path) {
        const self = this;
        this.env = {
            abort() {
                throw new Error('called abort');
            },
            eosio_assert_message(test, begin, len) {
                if (!test) {
                    let e;
                    try {
                        e = new Error('assert failed with message: ' + decoder.decode(new Uint8Array(self.inst.exports.memory.buffer, begin, len)));
                    }
                    catch (x) {
                        e = new Error('assert failed');
                    }
                    throw e;
                }
            },
            print_range(begin, end) {
                if (begin !== end)
                    process.stdout.write(decoder.decode(new Uint8Array(self.inst.exports.memory.buffer, begin, end - begin)));
            },
            get_input_data(cb_alloc_data, cb_alloc) {
                const input_data = self.input_data;
                const ptr = self.inst.exports.__indirect_function_table.get(cb_alloc)(cb_alloc_data, input_data.length);
                const dest = new Uint8Array(self.inst.exports.memory.buffer, ptr, input_data.length);
                for (let i = 0; i < input_data.length; ++i)
                    dest[i] = input_data[i];
            },
            set_output_data(begin, end) {
                self.output_data = Uint8Array.from(new Uint8Array(self.inst.exports.memory.buffer, begin, end - begin));
            },
        };

        const wasm = fs.readFileSync(path);
        this.input_data = new Uint8Array(0);
        this.mod = new WebAssembly.Module(wasm);
        this.reset();
    }

    reset() {
        this.inst = new WebAssembly.Instance(this.mod, { env: this.env });
        this.inst.exports.initialize();
    }

    describe_query_request() {
        this.inst.exports.describe_query_request();
        return JSON.parse(decoder.decode(this.output_data));
    }

    describe_query_response() {
        this.inst.exports.describe_query_response();
        return JSON.parse(decoder.decode(this.output_data));
    }

    create_query_request(request) {
        this.input_data = encoder.encode(JSON.stringify(request));
        this.output_data = new Uint8Array(0);
        this.inst.exports.create_query_request();
        return this.output_data;
    }

    decode_query_response(reply) {
        this.input_data = new Uint8Array(reply);
        this.output_data = new Uint8Array(0);
        this.inst.exports.decode_query_response();
        // console.log('<<' + decoder.decode(this.output_data) + '>>')
        return JSON.parse(decoder.decode(this.output_data));
    }

    async round_trip(request) {
        const requestBin = this.create_query_request(request);
        const bin = new SerialBuffer();
        bin.pushVaruint32(1);
        bin.pushBytes(requestBin);
        const queryReply = await fetch('http://127.0.0.1:8880/wasmql/v1/query', { method: 'POST', body: bin.asUint8Array() });
        if (queryReply.status !== 200)
            throw new Error(queryReply.status + ': ' + queryReply.statusText + ': ' + await queryReply.text());
        const reply = new SerialBuffer({ array: new Uint8Array(await queryReply.arrayBuffer()) });
        if (reply.getVaruint32() != 1)
            throw new Error("expected 1 reply")
        return this.decode_query_response(reply.getBytes());
    }
} // ClientWasm


module.exports = {Ut,ClientWasm};