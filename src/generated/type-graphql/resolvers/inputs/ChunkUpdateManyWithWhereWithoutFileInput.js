"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkUpdateManyWithWhereWithoutFileInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkScalarWhereInput_1 = require("../inputs/ChunkScalarWhereInput");
const ChunkUpdateManyMutationInput_1 = require("../inputs/ChunkUpdateManyMutationInput");
let ChunkUpdateManyWithWhereWithoutFileInput = class ChunkUpdateManyWithWhereWithoutFileInput {
};
exports.ChunkUpdateManyWithWhereWithoutFileInput = ChunkUpdateManyWithWhereWithoutFileInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkScalarWhereInput_1.ChunkScalarWhereInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ChunkScalarWhereInput_1.ChunkScalarWhereInput)
], ChunkUpdateManyWithWhereWithoutFileInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkUpdateManyMutationInput_1.ChunkUpdateManyMutationInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ChunkUpdateManyMutationInput_1.ChunkUpdateManyMutationInput)
], ChunkUpdateManyWithWhereWithoutFileInput.prototype, "data", void 0);
exports.ChunkUpdateManyWithWhereWithoutFileInput = ChunkUpdateManyWithWhereWithoutFileInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkUpdateManyWithWhereWithoutFileInput", {})
], ChunkUpdateManyWithWhereWithoutFileInput);
