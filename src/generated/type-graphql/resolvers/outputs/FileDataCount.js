"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FileDataCount = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const FileDataCountChunkArgs_1 = require("./args/FileDataCountChunkArgs");
let FileDataCount = class FileDataCount {
    getChunk(root, args) {
        return root.Chunk;
    }
};
exports.FileDataCount = FileDataCount;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        name: "Chunk",
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Root()),
    tslib_1.__param(1, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [FileDataCount, FileDataCountChunkArgs_1.FileDataCountChunkArgs]),
    tslib_1.__metadata("design:returntype", Number)
], FileDataCount.prototype, "getChunk", null);
exports.FileDataCount = FileDataCount = tslib_1.__decorate([
    TypeGraphQL.ObjectType("FileDataCount", {})
], FileDataCount);
