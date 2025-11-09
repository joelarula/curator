"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkUpdateWithWhereUniqueWithoutFileInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkUpdateWithoutFileInput_1 = require("../inputs/ChunkUpdateWithoutFileInput");
const ChunkWhereUniqueInput_1 = require("../inputs/ChunkWhereUniqueInput");
let ChunkUpdateWithWhereUniqueWithoutFileInput = class ChunkUpdateWithWhereUniqueWithoutFileInput {
};
exports.ChunkUpdateWithWhereUniqueWithoutFileInput = ChunkUpdateWithWhereUniqueWithoutFileInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkWhereUniqueInput_1.ChunkWhereUniqueInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ChunkWhereUniqueInput_1.ChunkWhereUniqueInput)
], ChunkUpdateWithWhereUniqueWithoutFileInput.prototype, "where", void 0);
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ChunkUpdateWithoutFileInput_1.ChunkUpdateWithoutFileInput, {
        nullable: false
    }),
    tslib_1.__metadata("design:type", ChunkUpdateWithoutFileInput_1.ChunkUpdateWithoutFileInput)
], ChunkUpdateWithWhereUniqueWithoutFileInput.prototype, "data", void 0);
exports.ChunkUpdateWithWhereUniqueWithoutFileInput = ChunkUpdateWithWhereUniqueWithoutFileInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkUpdateWithWhereUniqueWithoutFileInput", {})
], ChunkUpdateWithWhereUniqueWithoutFileInput);
