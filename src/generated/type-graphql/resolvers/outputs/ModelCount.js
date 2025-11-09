"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelCount = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelCountChunksArgs_1 = require("./args/ModelCountChunksArgs");
let ModelCount = class ModelCount {
    getChunks(root, args) {
        return root.chunks;
    }
};
exports.ModelCount = ModelCount;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => TypeGraphQL.Int, {
        name: "chunks",
        nullable: false
    }),
    tslib_1.__param(0, TypeGraphQL.Root()),
    tslib_1.__param(1, TypeGraphQL.Args()),
    tslib_1.__metadata("design:type", Function),
    tslib_1.__metadata("design:paramtypes", [ModelCount, ModelCountChunksArgs_1.ModelCountChunksArgs]),
    tslib_1.__metadata("design:returntype", Number)
], ModelCount.prototype, "getChunks", null);
exports.ModelCount = ModelCount = tslib_1.__decorate([
    TypeGraphQL.ObjectType("ModelCount", {})
], ModelCount);
