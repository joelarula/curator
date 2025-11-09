"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteManyChunkArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkWhereInput_1 = require("../../../inputs/ChunkWhereInput");
let DeleteManyChunkArgs = class DeleteManyChunkArgs {
};
exports.DeleteManyChunkArgs = DeleteManyChunkArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkWhereInput_1.ChunkWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ChunkWhereInput_1.ChunkWhereInput)
], DeleteManyChunkArgs.prototype, "where", void 0);
exports.DeleteManyChunkArgs = DeleteManyChunkArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], DeleteManyChunkArgs);
