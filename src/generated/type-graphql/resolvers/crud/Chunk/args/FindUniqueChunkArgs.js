"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FindUniqueChunkArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkWhereUniqueInput_1 = require("../../../inputs/ChunkWhereUniqueInput");
let FindUniqueChunkArgs = class FindUniqueChunkArgs {
};
exports.FindUniqueChunkArgs = FindUniqueChunkArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkWhereUniqueInput_1.ChunkWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ChunkWhereUniqueInput_1.ChunkWhereUniqueInput)
], FindUniqueChunkArgs.prototype, "where", void 0);
exports.FindUniqueChunkArgs = FindUniqueChunkArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], FindUniqueChunkArgs);
