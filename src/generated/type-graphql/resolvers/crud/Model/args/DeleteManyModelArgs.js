"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteManyModelArgs = void 0;
const tslib_1 = require("tslib");
const TypeGraphQL = tslib_1.__importStar(require("type-graphql"));
const ModelWhereInput_1 = require("../../../inputs/ModelWhereInput");
let DeleteManyModelArgs = class DeleteManyModelArgs {
};
exports.DeleteManyModelArgs = DeleteManyModelArgs;
tslib_1.__decorate([
    TypeGraphQL.Field(_type => ModelWhereInput_1.ModelWhereInput, {
        nullable: true
    }),
    tslib_1.__metadata("design:type", ModelWhereInput_1.ModelWhereInput)
], DeleteManyModelArgs.prototype, "where", void 0);
exports.DeleteManyModelArgs = DeleteManyModelArgs = tslib_1.__decorate([
    TypeGraphQL.ArgsType()
], DeleteManyModelArgs);
