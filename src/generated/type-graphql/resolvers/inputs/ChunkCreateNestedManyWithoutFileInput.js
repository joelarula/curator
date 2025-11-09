"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChunkCreateNestedManyWithoutFileInput = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ChunkWhereUniqueInput_1 = require("../inputs/ChunkWhereUniqueInput");
let ChunkCreateNestedManyWithoutFileInput = class ChunkCreateNestedManyWithoutFileInput {
};
exports.ChunkCreateNestedManyWithoutFileInput = ChunkCreateNestedManyWithoutFileInput;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => [ChunkWhereUniqueInput_1.ChunkWhereUniqueInput], {
        nullable: true
    }),
    tslib_1.__metadata("design:type", Array)
], ChunkCreateNestedManyWithoutFileInput.prototype, "connect", void 0);
exports.ChunkCreateNestedManyWithoutFileInput = ChunkCreateNestedManyWithoutFileInput = tslib_1.__decorate([
    TypeGraphQL.InputType("ChunkCreateNestedManyWithoutFileInput", {})
], ChunkCreateNestedManyWithoutFileInput);
